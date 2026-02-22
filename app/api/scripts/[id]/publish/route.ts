export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { video } from "@/lib/mux"
import { exec } from "child_process"
import { promisify } from "util"
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

const execAsync = promisify(exec)

/**
 * Download a URL to a local temp file. Returns the local path.
 */
async function downloadToTemp(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(destPath, buf)
}

/**
 * Concatenate video files using ffmpeg concat demuxer.
 * Returns the path to the concatenated file.
 */
async function ffmpegConcat(inputPaths: string[], outputPath: string): Promise<void> {
  // Write concat list file
  const listPath = outputPath + ".txt"
  const listContent = inputPaths.map(p => `file '${p}'`).join("\n")
  await writeFile(listPath, listContent)

  try {
    const { stderr } = await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`,
      { maxBuffer: 200 * 1024 * 1024 } // 200MB buffer for stderr
    )
    console.log("[Publish] ffmpeg concat done:", stderr.slice(-200))
  } finally {
    await unlink(listPath).catch(() => {})
  }
}

/**
 * Upload a local file to Mux via direct upload.
 * Returns { muxAssetId, muxPlaybackId }.
 */
async function uploadFileToMux(
  filePath: string,
  episodeNum: number,
  seriesTitle: string,
  synopsis: string
): Promise<{ muxAssetId: string; muxPlaybackId: string }> {
  // Create a direct upload URL
  const upload = await video.uploads.create({
    new_asset_settings: {
      playback_policy: ["public"],
      encoding_tier: "baseline",
      passthrough: JSON.stringify({ episodeNum, seriesTitle, synopsis: synopsis.slice(0, 200) }),
    },
    cors_origin: "https://opendrama.ai",
  })

  // Read the file and PUT to Mux
  const fileBuffer = await readFile(filePath)
  const putRes = await fetch(upload.url, {
    method: "PUT",
    body: fileBuffer,
    headers: { "Content-Type": "video/mp4" },
  })
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "")
    throw new Error(`Mux PUT failed: ${putRes.status} ${text}`)
  }

  // Poll for asset creation (up to 5 min)
  let muxAssetId: string | undefined
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const up = await video.uploads.retrieve(upload.id)
    if (up.asset_id) { muxAssetId = up.asset_id; break }
  }
  if (!muxAssetId) throw new Error("Mux upload timed out — asset not created after 5 minutes")

  // Get playback ID
  const asset = await video.assets.retrieve(muxAssetId)
  const muxPlaybackId = asset.playback_ids?.[0]?.id
  if (!muxPlaybackId) throw new Error("Mux asset created but no playback_id returned")

  return { muxAssetId, muxPlaybackId }
}

/**
 * Upload one episode to Mux.
 * - Single segment: pass URL directly via assets.create (no ffmpeg needed)
 * - Multiple segments: download all, ffmpeg concat, direct upload
 */
async function uploadEpisodeToMux(
  episodeNum: number,
  seriesTitle: string,
  synopsis: string,
  videoUrls: string[]
): Promise<{ muxAssetId: string; muxPlaybackId: string }> {
  if (videoUrls.length === 0) throw new Error("No video URLs to upload")

  // === Single segment: use assets.create directly (no ffmpeg) ===
  if (videoUrls.length === 1) {
    console.log(`[Publish] Ep${episodeNum}: single segment, passing URL directly to Mux`)
    const asset = await video.assets.create({
      inputs: [{ url: videoUrls[0] }],
      playback_policy: ["public"],
      encoding_tier: "baseline",
      passthrough: JSON.stringify({ episodeNum, seriesTitle, synopsis: synopsis.slice(0, 200) }),
    })
    const playbackId = asset.playback_ids?.[0]?.id
    if (!playbackId) throw new Error("Mux asset created but no playback_id returned")
    return { muxAssetId: asset.id, muxPlaybackId: playbackId }
  }

  // === Multiple segments: ffmpeg concat then direct upload ===
  console.log(`[Publish] Ep${episodeNum}: ${videoUrls.length} segments — downloading for ffmpeg concat`)
  const tmpDir = await mkdtemp(join(tmpdir(), `ep${episodeNum}-`))
  const segPaths: string[] = []

  try {
    // Download all segments in parallel (preserve order via index)
    await Promise.all(
      videoUrls.map(async (url, i) => {
        const segPath = join(tmpDir, `seg${String(i).padStart(4, "0")}.mp4`)
        segPaths[i] = segPath
        await downloadToTemp(url, segPath)
        console.log(`[Publish] Ep${episodeNum}: downloaded seg${i}`)
      })
    )

    const concatPath = join(tmpDir, "concat.mp4")
    await ffmpegConcat(segPaths, concatPath)
    console.log(`[Publish] Ep${episodeNum}: ffmpeg concat done, uploading to Mux`)

    const result = await uploadFileToMux(concatPath, episodeNum, seriesTitle, synopsis)
    console.log(`[Publish] Ep${episodeNum}: Mux upload complete — asset=${result.muxAssetId} playback=${result.muxPlaybackId}`)
    return result
  } finally {
    // Cleanup temp files
    for (const p of segPaths) await unlink(p).catch(() => {})
    const concatPath = join(tmpDir, "concat.mp4")
    await unlink(concatPath).catch(() => {})
    await import("fs/promises").then(fs => fs.rmdir(tmpDir)).catch(() => {})
  }
}

/**
 * POST /api/scripts/[id]/publish
 * Re-publish supported: episodes with muxPlaybackId are skipped.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  try {
    const script = await prisma.script.findFirst({
      where: { id, userId: session.user.id },
      include: { scenes: { orderBy: { sortOrder: "asc" } }, roles: true, published: true },
    })
    if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const { tags } = body as { tags?: string[] }

    // All done segments
    const allSegments = await prisma.videoSegment.findMany({
      where: { scriptId: id, status: "done", videoUrl: { not: null } },
      orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
    })
    if (allSegments.length === 0) {
      return NextResponse.json({ error: "No completed video segments found. Generate videos first." }, { status: 400 })
    }

    // Group by episode
    const segmentsByEpisode = new Map<number, typeof allSegments>()
    for (const seg of allSegments) {
      if (!segmentsByEpisode.has(seg.episodeNum)) segmentsByEpisode.set(seg.episodeNum, [])
      segmentsByEpisode.get(seg.episodeNum)!.push(seg)
    }
    const episodeMap = new Map<number, typeof script.scenes>()
    for (const scene of script.scenes) {
      if (!episodeMap.has(scene.episodeNum)) episodeMap.set(scene.episodeNum, [])
      episodeMap.get(scene.episodeNum)!.push(scene)
    }
    const episodeNums = [...segmentsByEpisode.keys()].sort((a, b) => a - b)

    // Create or reuse Series
    let seriesId = ""
    const isNewPublish = !script.published

    if (!isNewPublish) {
      const existingSeries = await prisma.series.findFirst({ where: { scriptId: id } })
      if (existingSeries) seriesId = existingSeries.id
    }

    if (!seriesId) {
      const series = await prisma.series.create({
        data: {
          title: script.title,
          description: script.logline || script.synopsis || "",
          synopsis: script.synopsis || null,
          coverUrl: script.coverWide || script.coverTall || null,
          coverTall: script.coverTall || null,
          coverWide: script.coverWide || null,
          genre: script.genre,
          tags: tags ? JSON.stringify(tags) : JSON.stringify([script.genre]),
          status: "active",
          userId: session.user.id,
          scriptId: id,
        },
      })
      seriesId = series.id
    }

    const synopsis = script.logline || script.synopsis || ""
    const uploadResults: { episodeNum: number; muxPlaybackId?: string; skipped?: boolean; error?: string }[] = []

    for (const episodeNum of episodeNums) {
      const scenes = episodeMap.get(episodeNum) || []
      const segments = segmentsByEpisode.get(episodeNum)!
      const firstScene = scenes[0]
      const totalDuration = segments.reduce((acc, s) => acc + s.durationSec, 0)
      const title = firstScene?.heading || "Episode " + episodeNum
      const description = scenes.map(s => s.action).filter(Boolean).join(" ").slice(0, 300) || "Episode " + episodeNum

      const existingEp = await prisma.episode.findUnique({
        where: { seriesId_episodeNum: { seriesId, episodeNum } },
      })
      if (existingEp?.muxPlaybackId) {
        uploadResults.push({ episodeNum, muxPlaybackId: existingEp.muxPlaybackId, skipped: true })
        continue
      }

      let muxAssetId: string | null = null
      let muxPlaybackId: string | null = null
      let uploadError: string | undefined

      try {
        const result = await uploadEpisodeToMux(episodeNum, script.title, synopsis, segments.map(s => s.videoUrl!))
        muxAssetId = result.muxAssetId
        muxPlaybackId = result.muxPlaybackId
        console.log("[Publish] Ep" + episodeNum + ": asset=" + muxAssetId + " playback=" + muxPlaybackId)
      } catch (err) {
        uploadError = err instanceof Error ? err.message : String(err)
        console.error("[Publish] Ep" + episodeNum + " upload failed:", err)
      }

      const epData = {
        title, description, duration: totalDuration,
        ...(muxAssetId ? { muxAssetId } : {}),
        ...(muxPlaybackId ? { muxPlaybackId } : {}),
      }

      if (existingEp) {
        await prisma.episode.update({ where: { id: existingEp.id }, data: epData })
      } else {
        await prisma.episode.create({
          data: { seriesId, episodeNum, status: "active", unlockCost: episodeNum <= 3 ? 0 : 10, ...epData },
        })
      }

      uploadResults.push({ episodeNum, muxPlaybackId: muxPlaybackId ?? undefined, error: uploadError })
    }

    // Create PublishedScript + achievement card (first publish only)
    let publishedId = script.published?.id
    if (isNewPublish) {
      const published = await prisma.publishedScript.create({
        data: { scriptId: id, userId: session.user.id, status: "published", tags: tags || [script.genre] },
      })
      publishedId = published.id

      const userCardCount = await prisma.achievementCard.count({ where: { userId: session.user.id } })
      const subtitle = userCardCount === 0 ? "First Creation"
        : episodeNums.length >= 10 ? "10-Episode Epic"
        : episodeNums.length >= 5 ? "5-Episode Series" : null

      await prisma.achievementCard.create({
        data: {
          userId: session.user.id, publishedScriptId: published.id,
          cardImage: script.coverTall || script.coverWide || "",
          rarity: "common", title: script.title, subtitle,
        },
      })
    }

    await prisma.script.update({
      where: { id },
      data: {
        status: "published",
        metadata: JSON.stringify({
          ...(script.metadata ? JSON.parse(script.metadata as string) : {}),
          publishedSeriesId: seriesId,
          publishedScriptId: publishedId,
          publishedAt: new Date().toISOString(),
        }),
      },
    })

    return NextResponse.json({
      publishedId, seriesId,
      episodesUploaded: uploadResults.filter(r => r.muxPlaybackId && !r.skipped).length,
      episodesSkipped: uploadResults.filter(r => r.skipped).length,
      episodesFailed: uploadResults.filter(r => !r.muxPlaybackId && !r.skipped).length,
      episodes: uploadResults,
    })
  } catch (error) {
    console.error("Publish script error:", error)
    return NextResponse.json({ error: "Failed to publish script" }, { status: 500 })
  }
}
