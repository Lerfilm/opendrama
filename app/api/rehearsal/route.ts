export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET  /api/rehearsal — list all rehearsals for current user
 * POST /api/rehearsal — create a new rehearsal
 * PUT  /api/rehearsal — update a rehearsal (prompt, model, etc.)
 * DELETE /api/rehearsal — delete a rehearsal
 */

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rehearsals = await prisma.rehearsal.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ rehearsals })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { prompt, model, resolution, durationSec } = body

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
  }

  const rehearsal = await prisma.rehearsal.create({
    data: {
      userId: session.user.id,
      prompt: prompt.trim(),
      model: model || "seedance_2_0",
      resolution: resolution || "720p",
      durationSec: durationSec || 5,
      status: "draft",
    },
  })

  return NextResponse.json({ rehearsal })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { id, prompt, model, resolution, durationSec } = body

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  // Only allow editing draft/failed rehearsals
  const existing = await prisma.rehearsal.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!["draft", "failed", "done"].includes(existing.status)) {
    return NextResponse.json({ error: "Cannot edit while generating" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (prompt !== undefined) data.prompt = prompt.trim()
  if (model !== undefined) data.model = model
  if (resolution !== undefined) data.resolution = resolution
  if (durationSec !== undefined) data.durationSec = durationSec

  // If editing after done/failed, reset to draft
  if (existing.status !== "draft") {
    data.status = "draft"
    data.videoUrl = null
    data.thumbnailUrl = null
    data.errorMessage = null
    data.providerTaskId = null
    data.tokenCost = null
  }

  const rehearsal = await prisma.rehearsal.update({
    where: { id },
    data,
  })

  return NextResponse.json({ rehearsal })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { id } = body

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const existing = await prisma.rehearsal.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // If generating, refuse
  if (["reserved", "submitted", "generating"].includes(existing.status)) {
    return NextResponse.json({ error: "Cannot delete while generating" }, { status: 400 })
  }

  await prisma.rehearsal.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
