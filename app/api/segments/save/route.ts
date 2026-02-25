export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { scriptId, episodeNum, model, resolution, segments: segsInput } = await req.json()

  if (!scriptId || !episodeNum || !model || !resolution || !Array.isArray(segsInput) || segsInput.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // Verify script ownership
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
  })
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 })
  }

  // Transaction: delete ALL existing segments for episode + create new ones.
  // When the user runs "AI Plan", they want a fresh set of segments.
  const segments = await prisma.$transaction(async (tx) => {
    // Refund any segments that still hold token reservations
    const oldSegs = await tx.videoSegment.findMany({
      where: { scriptId, episodeNum },
      select: { id: true, status: true, tokenCost: true },
    })
    const refundTotal = oldSegs
      .filter(s => ["reserved", "submitted", "generating"].includes(s.status) && s.tokenCost)
      .reduce((sum, s) => sum + (s.tokenCost ?? 0), 0)
    if (refundTotal > 0) {
      const { refundReservation } = await import("@/lib/tokens")
      await refundReservation(session.user.id, refundTotal, `Refund: episode ${episodeNum} re-planned`).catch(() => {})
    }

    // Delete ALL existing segments for this episode
    await tx.videoSegment.deleteMany({
      where: { scriptId, episodeNum },
    })

    // Create new segments with status "pending"
    const created = await Promise.all(
      segsInput.map(
        (seg: {
          segmentIndex: number
          sceneNum?: number
          durationSec?: number
          prompt: string
          shotType?: string
          cameraMove?: string
          beatType?: string
        }, i: number) =>
          tx.videoSegment.create({
            data: {
              scriptId,
              episodeNum,
              segmentIndex: seg.segmentIndex ?? i,
              sceneNum: seg.sceneNum ?? 0,
              durationSec: seg.durationSec || 15,
              prompt: seg.prompt,
              shotType: seg.shotType || "medium",
              cameraMove: seg.cameraMove || "static",
              beatType: seg.beatType || null,
              model,
              resolution,
              status: "pending",
              // No tokenCost — billing happens in /api/video/submit
            },
          })
      )
    )

    return created
  })

  return NextResponse.json({ segments })
}
