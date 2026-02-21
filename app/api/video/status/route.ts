import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { queryVideoTask } from "@/lib/video-generation"
import { confirmDeduction, refundReservation } from "@/lib/tokens"

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

  for (const seg of active) {
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
      }
    } catch (err) {
      console.error(`[VideoStatus] Failed to query provider for ${seg.id}:`, err)
    }
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
