import prisma from "@/lib/prisma"
import { aiComplete, aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, isStorageConfigured } from "@/lib/storage"

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

/**
 * Generate a cover image via OpenRouter Gemini (Nano Banana, 9:16 vertical).
 * Uploads to Supabase immediately and returns the permanent URL.
 */
async function generateCoverImage(scriptId: string, episodeNum: number, prompt: string): Promise<string> {
  const b64DataUrl = await aiGenerateImage(prompt, "9:16")

  if (isStorageConfigured()) {
    const b64 = b64DataUrl.split(",")[1]
    const buffer = Buffer.from(b64, "base64")
    const path = `${scriptId}/cover-tall-ep${episodeNum}-${Date.now()}.png`
    const supabaseUrl = await uploadToStorage("covers", path, buffer, "image/png")
    console.log(`[Cover] Uploaded to Supabase: ${supabaseUrl}`)
    return supabaseUrl
  }

  // Fallback when Supabase not configured (local dev)
  return b64DataUrl
}

/**
 * Submit cover generation task (9:16 vertical).
 * Uses OpenRouter Gemini (Nano Banana) — synchronous, uploads to Supabase,
 * encodes the permanent URL as a task ID for the status endpoint.
 */
export async function submitCoverGeneration(
  scriptId: string,
  episodeNum: number,
  prompt: string
): Promise<{ tallTaskId: string }> {
  console.log(`[Cover] Submitting cover generation for script=${scriptId} ep=${episodeNum}`)

  const imageUrl = await generateCoverImage(scriptId, episodeNum, prompt)
  console.log(`[Cover] Cover ready: ${imageUrl.slice(0, 80)}...`)

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

  // Skip mirroring if URL is already on Supabase (uploaded during generation)
  const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const alreadyOnSupabase = supabaseBase && tallUrl?.startsWith(supabaseBase)
  if (tallUrl && !alreadyOnSupabase && isStorageConfigured()) {
    console.warn("[Cover] URL not on Supabase, skipping mirror (unexpected):", tallUrl?.slice(0, 80))
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
