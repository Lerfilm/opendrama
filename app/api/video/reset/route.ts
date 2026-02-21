export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { refundReservation } from "@/lib/tokens"

/**
 * DELETE /api/video/reset
 * Reset (delete) video segments so they can be re-generated.
 * Refunds any reserved/unreleased tokens for non-done segments.
 *
 * Body:
 *   { segmentId: string }           — reset single segment
 *   { scriptId, episodeNum }        — reset all segments for an episode
 */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { segmentId, scriptId, episodeNum } = body

  // ── Single segment reset ──
  if (segmentId) {
    const segment = await prisma.videoSegment.findUnique({
      where: { id: segmentId },
      include: { script: { select: { userId: true } } },
    })

    if (!segment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 })
    }
    if (segment.script.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Refund tokens only for segments still holding a reservation.
    // "failed" segments have already been refunded by the status poller,
    // so we only refund "reserved" / "submitted" / "generating" states.
    const stillReserved = ["reserved", "submitted", "generating"].includes(segment.status)
    if (segment.tokenCost && stillReserved) {
      await refundReservation(
        session.user.id,
        segment.tokenCost,
        `Refund: segment ${segmentId} reset by user`
      ).catch(() => {}) // best-effort
    }

    await prisma.videoSegment.delete({ where: { id: segmentId } })
    return NextResponse.json({ ok: true })
  }

  // ── All-episode reset ──
  if (scriptId && episodeNum !== undefined) {
    const epNum = parseInt(String(episodeNum), 10)
    if (isNaN(epNum)) {
      return NextResponse.json({ error: "Invalid episodeNum" }, { status: 400 })
    }

    // Verify ownership
    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
    })
    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    // Fetch segments to calculate refund
    const segments = await prisma.videoSegment.findMany({
      where: { scriptId, episodeNum: epNum },
    })

    // Refund tokens only for segments still holding a reservation.
    // "failed" segments have already been refunded by the status poller.
    const refundTotal = segments
      .filter(s => ["reserved", "submitted", "generating"].includes(s.status) && s.tokenCost)
      .reduce((sum, s) => sum + (s.tokenCost ?? 0), 0)

    if (refundTotal > 0) {
      await refundReservation(
        session.user.id,
        refundTotal,
        `Refund: episode ${epNum} reset by user`
      ).catch(() => {})
    }

    await prisma.videoSegment.deleteMany({
      where: { scriptId, episodeNum: epNum },
    })

    return NextResponse.json({ ok: true, deleted: segments.length })
  }

  return NextResponse.json(
    { error: "segmentId or (scriptId + episodeNum) required" },
    { status: 400 }
  )
}
