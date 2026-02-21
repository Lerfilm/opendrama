import prisma from "@/lib/prisma"
import { aiComplete } from "@/lib/ai"
import { volcRequest } from "@/lib/volcengine"

/**
 * Generate a cover prompt for an episode using LLM.
 */
export async function generateCoverPrompt(scriptId: string, episodeNum: number): Promise<string> {
  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    include: {
      scenes: { where: { episodeNum }, orderBy: { sceneNum: "asc" } },
      roles: true,
    },
  })
  if (!script) throw new Error("Script not found")

  const sceneSummary = script.scenes
    .map((s) => `Scene ${s.sceneNum}: ${s.location || ""} - ${(s.action || "").slice(0, 100)}`)
    .join("\n")
  const characterNames = script.roles.map((r) => r.name).join(", ")

  const result = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a professional movie poster designer. Generate an AI image generation prompt based on the following episode information.
Requirements:
- Movie poster style, visually striking
- Describe composition, character poses, scene atmosphere, lighting and color
- Do NOT include any text in the image
- English description, under 800 characters
- Suitable for cinematic poster style`,
      },
      {
        role: "user",
        content: `Title: ${script.title}
Episode ${episodeNum}
Characters: ${characterNames}
Scenes:
${sceneSummary}`,
      },
    ],
    temperature: 0.9,
    maxTokens: 1024,
  })

  return result.content
}

// Jimeng text-to-image req_key
const T2I_REQ_KEY = "jimeng_high_aes_general_v21_L20"

interface T2ISubmitResult {
  task_id: string
}

interface T2IQueryResult {
  task_id: string
  status: string      // "pending" | "running" | "done" | "failed"
  resp_data?: string  // JSON string containing image_urls
}

/**
 * Submit a single text-to-image task to Jimeng.
 * Returns the provider task_id.
 */
async function submitT2ITask(prompt: string, width: number, height: number): Promise<string> {
  const result = await volcRequest<T2ISubmitResult>(
    "CVSync2AsyncSubmitTask",
    {
      req_key: T2I_REQ_KEY,
      prompt,
      width,
      height,
      return_url: true,
      logo_info: { add_logo: false },
    }
  )
  if (!result.task_id) {
    throw new Error(`T2I submission failed: no task_id. Response: ${JSON.stringify(result)}`)
  }
  return result.task_id
}

/**
 * Submit cover generation tasks (wide 16:9 + tall 3:4) to Jimeng.
 * Both submitted in parallel.
 */
export async function submitCoverGeneration(
  scriptId: string,
  episodeNum: number,
  prompt: string
): Promise<{ wideTaskId: string; tallTaskId: string }> {
  console.log(`[Cover] Submitting cover generation for script=${scriptId} ep=${episodeNum}`)

  const [wideTaskId, tallTaskId] = await Promise.all([
    submitT2ITask(prompt, 1920, 1080),  // 16:9 wide
    submitT2ITask(prompt, 1024, 1365),  // 3:4 tall (≈ 3:4 ratio)
  ])

  console.log(`[Cover] Submitted: wide=${wideTaskId} tall=${tallTaskId}`)
  return { wideTaskId, tallTaskId }
}

/**
 * Query a single T2I task result.
 * Returns { status, imageUrl }.
 */
export async function queryCoverResult(taskId: string): Promise<{ imageUrl?: string; status: string }> {
  const result = await volcRequest<T2IQueryResult>(
    "CVSync2AsyncGetResult",
    { req_key: T2I_REQ_KEY, task_id: taskId }
  )

  const status = result.status || "pending"

  if (status === "done") {
    let imageUrl: string | undefined
    if (result.resp_data) {
      try {
        const respData = JSON.parse(result.resp_data)
        imageUrl =
          respData.image_urls?.[0] ||
          respData.images?.[0] ||
          respData.url ||
          undefined
      } catch {
        console.warn("[Cover] Failed to parse resp_data:", result.resp_data)
      }
    }
    return { status: "done", imageUrl }
  }

  if (status === "failed" || status === "error") {
    return { status: "failed" }
  }

  return { status: "generating" }
}

/**
 * Poll both cover tasks until done, save results to Script.
 * Called server-side after submitCoverGeneration.
 * Max wait ~3 minutes (36 × 5s).
 */
export async function pollAndSaveCovers(
  scriptId: string,
  wideTaskId: string,
  tallTaskId: string
): Promise<{ coverWide?: string; coverTall?: string }> {
  const MAX_POLLS = 36
  const POLL_INTERVAL_MS = 5000

  let wideUrl: string | undefined
  let tallUrl: string | undefined
  let wideDone = false
  let tallDone = false

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

    if (!wideDone) {
      const r = await queryCoverResult(wideTaskId).catch((): { status: string; imageUrl?: string } => ({ status: "failed" }))
      if (r.status === "done") { wideUrl = r.imageUrl; wideDone = true }
      if (r.status === "failed") { wideDone = true }
    }

    if (!tallDone) {
      const r = await queryCoverResult(tallTaskId).catch((): { status: string; imageUrl?: string } => ({ status: "failed" }))
      if (r.status === "done") { tallUrl = r.imageUrl; tallDone = true }
      if (r.status === "failed") { tallDone = true }
    }

    if (wideDone && tallDone) break
  }

  // Save to Script
  if (wideUrl || tallUrl) {
    await prisma.script.update({
      where: { id: scriptId },
      data: {
        ...(wideUrl ? { coverWide: wideUrl } : {}),
        ...(tallUrl ? { coverTall: tallUrl, coverImage: tallUrl } : {}),
      },
    })
    console.log(`[Cover] Saved: wide=${wideUrl} tall=${tallUrl}`)
  }

  return { coverWide: wideUrl, coverTall: tallUrl }
}
