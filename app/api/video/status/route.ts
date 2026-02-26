import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { queryVideoTask, enrichSegmentWithCharacters, submitVideoTask } from "@/lib/video-generation"
import { confirmDeduction, refundReservation } from "@/lib/tokens"
import { uploadSegmentToMux } from "@/lib/mux"

// Segments stuck in generating/submitted for longer than this are auto-failed
const STALE_TIMEOUT_MS = 45 * 60 * 1000 // 45 minutes

/**
 * Sync active segments with the video generation provider,
 * then return updated data.
 */
async function syncActiveSegments(
  segments: Array<{
    id: string
    status: string
    model: string | null
    providerTaskId: string | null
    tokenCost: number | null
    scriptId: string
    episodeNum: number
    createdAt: Date
  }>
) {
  const active = segments.filter(
    (s) =>
      (s.status === "submitted" || s.status === "generating") &&
      s.providerTaskId &&
      s.model
  )

  if (active.length === 0) return

  // Get userId from script (VideoSegment doesn't have userId directly)
  let userId: string | null = null
  if (active.length > 0) {
    const script = await prisma.script.findUnique({
      where: { id: active[0].scriptId },
      select: { userId: true },
    })
    userId = script?.userId ?? null
  }

  const now = Date.now()

  for (const seg of active) {
    // Auto-fail segments that have been stuck for too long (provider task likely expired)
    const ageMs = now - new Date(seg.createdAt).getTime()
    if (ageMs > STALE_TIMEOUT_MS) {
      console.warn(`[VideoStatus] Segment ${seg.id} stuck for ${Math.round(ageMs / 60000)}min — auto-failing`)
      const { count } = await prisma.videoSegment.updateMany({
        where: { id: seg.id, status: { in: ["submitted", "generating"] } },
        data: { status: "failed", errorMessage: "Generation timed out (>45min)" },
      })
      if (count > 0 && userId && seg.tokenCost) {
        await refundReservation(
          userId,
          seg.tokenCost,
          `Refund: segment ${seg.id} timed out`
        ).catch(() => {})
      }
      Object.assign(seg, { status: "failed", errorMessage: "Generation timed out (>45min)" })
      // Also kick next reserved segment after timeout-fail
      if (count > 0) kickNextReservedSegment(seg.scriptId, seg.episodeNum, userId).catch(() => {})
      continue
    }

    try {
      const result = await queryVideoTask(seg.model!, seg.providerTaskId!)

      if (result.status !== seg.status) {
        const updateData: Record<string, unknown> = { status: result.status }
        if (result.videoUrl) updateData.videoUrl = result.videoUrl
        if (result.error) updateData.errorMessage = result.error
        if (result.status === "done") updateData.completedAt = new Date()

        // Use atomic conditional update: only update if still in an active state.
        // This prevents race conditions where two concurrent pollers both see the
        // same "generating" segment and both attempt to refund/confirm tokens.
        const { count } = await prisma.videoSegment.updateMany({
          where: {
            id: seg.id,
            status: { in: ["submitted", "generating"] },
          },
          data: updateData,
        })

        // Only handle tokens if WE were the one to update the status (count === 1)
        if (count > 0 && userId && seg.tokenCost) {
          if (result.status === "done") {
            await confirmDeduction(userId, seg.tokenCost, { segmentId: seg.id })
            // Upload to Mux for permanent HLS storage (fire-and-forget)
            if (result.videoUrl) {
              uploadSegmentToMux(seg.id, result.videoUrl).catch(() => {})
            }
          }
          if (result.status === "failed") {
            await refundReservation(
              userId,
              seg.tokenCost,
              `Refund: video segment ${seg.id} failed`
            )
          }
        }

        // Update in-memory object for response
        Object.assign(seg, updateData)

        // Sequential mode: when a segment finishes (done or failed),
        // kick off the next reserved segment in the same script episode.
        if (count > 0 && (result.status === "done" || result.status === "failed")) {
          kickNextReservedSegment(seg.scriptId, seg.episodeNum, userId).catch(() => {})
        }
      }
    } catch (err) {
      console.error(`[VideoStatus] Failed to query provider for ${seg.id}:`, err)
    }
  }
}

/**
 * Find the next reserved (not yet submitted) segment in the same episode
 * and submit it to the video generation provider.
 */
async function kickNextReservedSegment(scriptId: string, episodeNum: number, userId: string | null) {
  // Find the first reserved segment (ordered by segmentIndex)
  const next = await prisma.videoSegment.findFirst({
    where: { scriptId, episodeNum, status: "reserved" },
    orderBy: { segmentIndex: "asc" },
  })
  if (!next || !next.model || !next.resolution) return

  console.log(`[VideoStatus] Sequential: kicking next segment ${next.id} (index ${next.segmentIndex})`)

  try {
    const { prompt, imageUrls, episodeSeed } = await enrichSegmentWithCharacters(next.id)

    const { taskId } = await submitVideoTask({
      model: next.model,
      resolution: next.resolution,
      prompt,
      imageUrls,
      referenceVideo: next.referenceVideo || undefined,
      durationSec: next.durationSec,
      seed: episodeSeed,
    })

    await prisma.videoSegment.update({
      where: { id: next.id },
      data: { status: "submitted", providerTaskId: taskId },
    })
    console.log(`[VideoStatus] Sequential: segment ${next.id} submitted as task ${taskId}`)
  } catch (err) {
    console.error(`[VideoStatus] Sequential: segment ${next.id} failed to submit:`, err)
    if (next.tokenCost && userId) {
      await refundReservation(userId, next.tokenCost, `Refund: sequential segment ${next.id} failed`).catch(() => {})
    }
    await prisma.videoSegment.update({
      where: { id: next.id },
      data: { status: "failed", errorMessage: String(err) },
    }).catch(() => {})
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const segmentId = searchParams.get("segmentId")
  const scriptId = searchParams.get("scriptId")
  const episodeNum = searchParams.get("episodeNum")

  // Single segment status
  if (segmentId) {
    const segment = await prisma.videoSegment.findUnique({
      where: { id: segmentId },
    })
    if (!segment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 })
    }
    // Sync single active segment
    await syncActiveSegments([segment])
    return NextResponse.json(segment)
  }

  // All segments for a script episode
  if (scriptId && episodeNum) {
    const segments = await prisma.videoSegment.findMany({
      where: {
        scriptId,
        episodeNum: parseInt(episodeNum),
      },
      orderBy: { segmentIndex: "asc" },
    })
    await syncActiveSegments(segments)
    return NextResponse.json({ segments })
  }

  // All segments for a script
  if (scriptId) {
    const segments = await prisma.videoSegment.findMany({
      where: { scriptId },
      orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
    })
    await syncActiveSegments(segments)
    return NextResponse.json({ segments })
  }

  return NextResponse.json({ error: "segmentId or scriptId required" }, { status: 400 })
}
