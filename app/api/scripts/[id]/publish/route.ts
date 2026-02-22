export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { video } from "@/lib/mux"

/**
 * POST /api/scripts/[id]/publish
 * Phase 1: Create Mux direct-upload URLs for each episode.
 * Returns { seriesId, episodes: [{ episodeNum, uploadUrl, segmentUrls }] }
 * The CLIENT then downloads segment videos (TOS URLs — only accessible from CN IPs)
 * and PUTs the merged video to the Mux uploadUrl.
 *
 * Phase 2 (completion): POST /api/scripts/[id]/publish/complete
 * Client calls this after each upload finishes, passing muxUploadId.
 * Server polls Mux for the asset/playbackId and stores it.
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

    // For each episode: if already has muxPlaybackId → skip; otherwise create Mux direct upload URL
    const synopsis = script.logline || script.synopsis || ""
    const episodeResults: {
      episodeNum: number
      uploadUrl?: string
      muxUploadId?: string
      segmentUrls?: string[]
      muxPlaybackId?: string
      skipped?: boolean
      totalDuration?: number
      title?: string
    }[] = []

    for (const episodeNum of episodeNums) {
      const segments = segmentsByEpisode.get(episodeNum)!
      const scenes = episodeMap.get(episodeNum) || []
      const firstScene = scenes[0]
      const totalDuration = segments.reduce((acc, s) => acc + s.durationSec, 0)
      const title = firstScene?.heading || "Episode " + episodeNum

      const existingEp = await prisma.episode.findUnique({
        where: { seriesId_episodeNum: { seriesId, episodeNum } },
      })

      if (existingEp?.muxPlaybackId) {
        episodeResults.push({ episodeNum, muxPlaybackId: existingEp.muxPlaybackId, skipped: true })
        continue
      }

      // Create Mux direct upload URL — client will PUT the video here
      const upload = await video.uploads.create({
        cors_origin: "*",
        new_asset_settings: {
          playback_policy: ["public"],
          encoding_tier: "baseline",
          passthrough: JSON.stringify({ episodeNum, seriesTitle: script.title, synopsis: synopsis.slice(0, 200) }),
        },
      })

      const description = scenes.map(s => s.action).filter(Boolean).join(" ").slice(0, 300) || "Episode " + episodeNum

      // Create/update Episode record (without muxPlaybackId yet — will be set after upload)
      if (existingEp) {
        await prisma.episode.update({
          where: { id: existingEp.id },
          data: { title, description, duration: totalDuration, muxAssetId: null, muxPlaybackId: null },
        })
      } else {
        await prisma.episode.create({
          data: {
            seriesId, episodeNum, status: "active",
            unlockCost: episodeNum <= 3 ? 0 : 10,
            title, description, duration: totalDuration,
          },
        })
      }

      episodeResults.push({
        episodeNum,
        uploadUrl: upload.url,
        muxUploadId: upload.id,
        segmentUrls: segments.map(s => s.videoUrl!),
        totalDuration,
        title,
      })
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
        : episodeNums.length >= 5 ? "5-Episode Series"
        : null

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
      publishedId,
      seriesId,
      episodesSkipped: episodeResults.filter(r => r.skipped).length,
      episodesToUpload: episodeResults.filter(r => !r.skipped).length,
      episodes: episodeResults,
    })
  } catch (error) {
    console.error("Publish script error:", error)
    return NextResponse.json({ error: "Failed to publish script" }, { status: 500 })
  }
}
