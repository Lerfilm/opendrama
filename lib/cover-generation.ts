import prisma from "@/lib/prisma"
import { aiComplete } from "@/lib/ai"
import { mirrorUrlToStorage, isStorageConfigured } from "@/lib/storage"

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

// ARK API image generation (Doubao Seedream)
const ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3"
const T2I_MODEL = "doubao-seedream-3-0-t2i-250415"

interface ArkImageResponse {
  data: Array<{ url: string }>
}

/**
 * Generate a single image via ARK API (synchronous, returns URL directly).
 * Size: "1080x1920" for 9:16 vertical.
 */
async function generateImageViaArk(prompt: string): Promise<string> {
  const apiKey = process.env.ARK_API_KEY
  if (!apiKey) throw new Error("ARK_API_KEY env var not set")

  const res = await fetch(`${ARK_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: T2I_MODEL,
      prompt,
      size: "1080x1920",
      n: 1,
    }),
  })

  const json = await res.json() as ArkImageResponse & { error?: { message?: string } }

  if (!res.ok) {
    throw new Error(`ARK T2I error ${res.status}: ${JSON.stringify(json)}`)
  }

  const url = json.data?.[0]?.url
  if (!url) {
    throw new Error(`ARK T2I: no image URL in response: ${JSON.stringify(json)}`)
  }

  return url
}

/**
 * Submit cover generation task (9:16 vertical).
 * Uses ARK synchronous image generation — returns a synthetic task ID
 * that encodes the image URL for the status endpoint.
 */
export async function submitCoverGeneration(
  scriptId: string,
  episodeNum: number,
  prompt: string
): Promise<{ tallTaskId: string }> {
  console.log(`[Cover] Submitting cover generation for script=${scriptId} ep=${episodeNum}`)

  // ARK is synchronous — generate the image immediately and encode the URL
  // as a base64 task ID so the status endpoint can decode it.
  const imageUrl = await generateImageViaArk(prompt)
  console.log(`[Cover] Image generated: ${imageUrl.slice(0, 80)}...`)

  // Encode URL as a "task ID" so existing polling infrastructure works
  const tallTaskId = `ark:${Buffer.from(imageUrl).toString("base64")}`

  return { tallTaskId }
}

/**
 * Query a cover result. For ARK tasks (prefix "ark:"), the URL is decoded
 * from the task ID itself. For legacy Volc tasks, returns failed.
 */
export async function queryCoverResult(taskId: string): Promise<{ imageUrl?: string; status: string }> {
  if (taskId.startsWith("ark:")) {
    try {
      const imageUrl = Buffer.from(taskId.slice(4), "base64").toString("utf8")
      return { status: "done", imageUrl }
    } catch {
      return { status: "failed" }
    }
  }

  // Legacy Volc task IDs — these will fail since we no longer use that API
  return { status: "failed" }
}

/**
 * Poll the tall cover task until done, save result to Script.
 * For ARK tasks, this resolves immediately (synchronous generation).
 */
export async function pollAndSaveCovers(
  scriptId: string,
  tallTaskId: string
): Promise<{ coverTall?: string }> {
  const r = await queryCoverResult(tallTaskId).catch((): { status: string; imageUrl?: string } => ({ status: "failed" }))

  let tallUrl = r.status === "done" ? r.imageUrl : undefined

  // Mirror to Supabase for permanent storage (ARK URLs expire)
  if (tallUrl && isStorageConfigured()) {
    try {
      const storedUrl = await mirrorUrlToStorage(
        "covers",
        `${scriptId}/cover-tall-${Date.now()}.jpg`,
        tallUrl
      )
      tallUrl = storedUrl
      console.log(`[Cover] Mirrored to Supabase: ${storedUrl}`)
    } catch (err) {
      console.warn("[Cover] Supabase mirror failed, using ARK URL:", err)
    }
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
