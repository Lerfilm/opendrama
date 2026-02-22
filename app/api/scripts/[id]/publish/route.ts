export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { video } from "@/lib/mux"

/**
 * Upload one episode to Mux by passing TOS video URLs directly.
 * Mux downloads the videos server-side and concatenates them.
 * Requires type:"video" on each input (otherwise Mux treats extras as overlays).
 */
async function uploadEpisodeToMux(
  episodeNum: number,
  seriesTitle: string,
  synopsis: string,
  videoUrls: string[]
): Promise<{ muxAssetId: string; muxPlaybackId: string }> {
  if (videoUrls.length === 0) throw new Error("No video URLs to upload")

  const asset = await video.assets.create({
    inputs: videoUrls.map(url => ({ url, type: "video" as const })),
    playback_policy: ["public"],
    encoding_tier: "baseline",
    passthrough: JSON.stringify({ episodeNum, seriesTitle, synopsis: synopsis.slice(0, 200) }),
  })

  const playbackId = asset.playback_ids?.[0]?.id
  if (!playbackId) throw new Error("Mux asset created but no playback_id returned")

  return { muxAssetId: asset.id, muxPlaybackId: playbackId }
}

/**
 * POST /api/scripts/[id]/publish
 * Server-side: Mux downloads TOS video URLs directly (both are accessible from US).
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
        console.error("[Publish] Ep" + episodeNum + " Mux upload failed:", err)
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
