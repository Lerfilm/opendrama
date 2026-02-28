import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    scriptId: string
    episodeNum: number
    afterIndex: number
    prompt: string
    durationSec: number
    shotType?: string
    cameraMove?: string
    sceneNum: number
  }

  const { scriptId, episodeNum, afterIndex, prompt, durationSec, shotType, cameraMove, sceneNum } = body

  if (!scriptId || !episodeNum || !prompt || !sceneNum) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  // Verify ownership
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { id: true },
  })
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const newIndex = afterIndex + 1

  // Transaction: shift subsequent segments, then create the new one
  const segment = await prisma.$transaction(async (tx) => {
    // Shift segments at or after newIndex to make room
    // First collect the IDs that need shifting
    const toShift = await tx.videoSegment.findMany({
      where: { scriptId, episodeNum, segmentIndex: { gte: newIndex } },
      select: { id: true, segmentIndex: true },
      orderBy: { segmentIndex: "desc" }, // shift from highest to avoid unique conflict
    })

    // Phase 1: Set to negative temp indices
    for (const seg of toShift) {
      await tx.videoSegment.update({
        where: { id: seg.id },
        data: { segmentIndex: -(seg.segmentIndex + 1000) },
      })
    }

    // Phase 2: Set final shifted indices (+1)
    for (const seg of toShift) {
      await tx.videoSegment.update({
        where: { id: seg.id },
        data: { segmentIndex: seg.segmentIndex + 1 },
      })
    }

    // Create the new segment
    return tx.videoSegment.create({
      data: {
        scriptId,
        episodeNum,
        segmentIndex: newIndex,
        sceneNum,
        durationSec: durationSec || 5,
        prompt,
        shotType: shotType || null,
        cameraMove: cameraMove || null,
        status: "pending",
      },
    })
  })

  return NextResponse.json({ ok: true, segmentId: segment.id })
}
