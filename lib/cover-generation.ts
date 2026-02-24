import prisma from "@/lib/prisma"
import { isStorageConfigured } from "@/lib/storage"
import { generateCoverForEpisode } from "@/lib/image-generation"

/**
 * Generate a cover prompt for an episode using LLM.
 * (Legacy wrapper — used by /api/cover/generate route)
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

  // Use the shared lib function directly — returns both coverUrl and prompt
  const result = await generateCoverForEpisode({
    userId: script.userId,
    scriptId,
    episodeNum,
    title: script.title,
    genre: script.genre || "drama",
    sceneSummary,
    characterNames,
  })

  return result.prompt
}

/**
 * Submit cover generation task (9:16 vertical).
 * Uses the shared lib function for generation + upload.
 */
export async function submitCoverGeneration(
  scriptId: string,
  episodeNum: number,
  prompt: string
): Promise<{ tallTaskId: string }> {
  console.log(`[Cover] Submitting cover generation for script=${scriptId} ep=${episodeNum}`)

  // Fetch script data for the shared function
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

  const result = await generateCoverForEpisode({
    userId: script.userId,
    scriptId,
    episodeNum,
    title: script.title,
    genre: script.genre || "drama",
    sceneSummary,
    characterNames,
  })

  console.log(`[Cover] Cover ready: ${result.coverUrl.slice(0, 80)}...`)

  // Encode URL as a "task ID" so existing polling infrastructure works
  const tallTaskId = `ark:${Buffer.from(result.coverUrl).toString("base64")}`

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
