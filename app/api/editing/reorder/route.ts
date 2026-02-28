import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scriptId, episodeNum, order } = await req.json() as {
    scriptId: string
    episodeNum: number
    order: { segmentId: string; newIndex: number }[]
  }

  if (!scriptId || !episodeNum || !Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  // Verify ownership
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { id: true },
  })
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Two-phase update to avoid unique constraint violation on [scriptId, episodeNum, segmentIndex]
  // Phase 1: Set all to negative temporary indices
  // Phase 2: Set final indices
  await prisma.$transaction(async (tx) => {
    // Phase 1: Negative indices
    for (let i = 0; i < order.length; i++) {
      await tx.videoSegment.update({
        where: { id: order[i].segmentId },
        data: { segmentIndex: -(i + 1) },
      })
    }
    // Phase 2: Final indices
    for (const item of order) {
      await tx.videoSegment.update({
        where: { id: item.segmentId },
        data: { segmentIndex: item.newIndex },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
