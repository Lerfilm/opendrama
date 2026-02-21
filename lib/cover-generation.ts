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
        content: `You are a cover art director for Chinese short-form vertical dramas (竖屏短剧).
Generate a vivid, cinematic image prompt in English for a 9:16 vertical poster.

Style requirements:
- Photorealistic, dramatic lighting (strong rim light, backlight, or neon glow)
- Focused on 1-2 characters: close-up or medium shot, intense emotional expression
- Cinematic composition for vertical/portrait orientation (9:16)
- High contrast, rich colors — bold shadows and highlights
- Atmosphere: tension, desire, betrayal, romance, or power struggle
- Real-life settings: office, luxury villa, street at night, hospital corridor, etc.
- Inspired by popular Chinese short drama aesthetics (抖音短剧 style)
- NO text, NO watermark, NO subtitles in the image
- Output: one compact English prompt, under 800 characters`,
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
 * Submit cover generation task (9:16 vertical) to Jimeng.
 */
export async function submitCoverGeneration(
  scriptId: string,
  episodeNum: number,
  prompt: string
): Promise<{ tallTaskId: string }> {
  console.log(`[Cover] Submitting cover generation for script=${scriptId} ep=${episodeNum}`)

  const tallTaskId = await submitT2ITask(prompt, 1080, 1920)  // 9:16 vertical

  console.log(`[Cover] Submitted: tall=${tallTaskId}`)
  return { tallTaskId }
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
 * Poll the tall cover task until done, save result to Script.
 * Called server-side after submitCoverGeneration.
 * Max wait ~3 minutes (36 × 5s).
 */
export async function pollAndSaveCovers(
  scriptId: string,
  tallTaskId: string
): Promise<{ coverTall?: string }> {
  const MAX_POLLS = 36
  const POLL_INTERVAL_MS = 5000

  let tallUrl: string | undefined

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

    const r = await queryCoverResult(tallTaskId).catch((): { status: string; imageUrl?: string } => ({ status: "failed" }))
    if (r.status === "done") { tallUrl = r.imageUrl; break }
    if (r.status === "failed") { break }
  }

  // Save to Script
  if (tallUrl) {
    await prisma.script.update({
      where: { id: scriptId },
      data: { coverTall: tallUrl, coverImage: tallUrl },
    })
    console.log(`[Cover] Saved: tall=${tallUrl}`)
  }

  return { coverTall: tallUrl }
}
