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

  // Transaction: delete existing pending segments + create new ones
  const segments = await prisma.$transaction(async (tx) => {
    // Delete existing pending segments for this episode
    await tx.videoSegment.deleteMany({
      where: {
        scriptId,
        episodeNum,
        status: "pending",
      },
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
