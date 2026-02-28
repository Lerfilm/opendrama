import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * PATCH /api/video/segment — Update a segment's prompt/settings
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { segmentId, prompt, shotType, cameraMove, durationSec } = body

  if (!segmentId) {
    return NextResponse.json({ error: "segmentId required" }, { status: 400 })
  }

  // Verify ownership
  const segment = await prisma.videoSegment.findFirst({
    where: { id: segmentId },
    include: { script: { select: { userId: true } } },
  })

  if (!segment || segment.script.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Build update data — only include provided fields
  const data: Record<string, unknown> = {}
  if (prompt !== undefined) data.prompt = prompt
  if (shotType !== undefined) data.shotType = shotType
  if (cameraMove !== undefined) data.cameraMove = cameraMove
  if (durationSec !== undefined) data.durationSec = Number(durationSec)

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const updated = await prisma.videoSegment.update({
    where: { id: segmentId },
    data,
  })

  return NextResponse.json({ success: true, segment: { id: updated.id, prompt: updated.prompt } })
}
