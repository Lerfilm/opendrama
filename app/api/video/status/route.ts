import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

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
    return NextResponse.json({ segments })
  }

  // All segments for a script
  if (scriptId) {
    const segments = await prisma.videoSegment.findMany({
      where: { scriptId },
      orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
    })
    return NextResponse.json({ segments })
  }

  return NextResponse.json({ error: "segmentId or scriptId required" }, { status: 400 })
}
