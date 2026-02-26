export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { reserveTokens, calculateTokenCost, refundReservation } from "@/lib/tokens"
import { submitVideoTask } from "@/lib/video-generation"

/**
 * POST /api/rehearsal/submit — submit a rehearsal for video generation
 * Body: { id: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const rehearsal = await prisma.rehearsal.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!rehearsal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Only submit draft or failed rehearsals
  if (!["draft", "failed"].includes(rehearsal.status)) {
    return NextResponse.json({ error: "Already submitted or generating" }, { status: 400 })
  }

  // Calculate cost
  const cost = calculateTokenCost(rehearsal.model, rehearsal.resolution, rehearsal.durationSec)

  // Reserve tokens
  const reserved = await reserveTokens(
    session.user.id,
    cost,
    `Rehearsal video generation: ${rehearsal.prompt.substring(0, 50)}...`
  )
  if (!reserved) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 402 })
  }

  // Update status to reserved
  await prisma.rehearsal.update({
    where: { id },
    data: {
      status: "reserved",
      tokenCost: cost,
      errorMessage: null,
      videoUrl: null,
      thumbnailUrl: null,
    },
  })

  // Submit to video generation provider
  try {
    const result = await submitVideoTask({
      model: rehearsal.model,
      resolution: rehearsal.resolution,
      prompt: rehearsal.prompt,
      durationSec: rehearsal.durationSec,
    })

    await prisma.rehearsal.update({
      where: { id },
      data: {
        status: "submitted",
        providerTaskId: result.taskId,
      },
    })

    const updated = await prisma.rehearsal.findUnique({ where: { id } })
    return NextResponse.json({ rehearsal: updated })
  } catch (err: unknown) {
    // Refund on submission failure
    await refundReservation(session.user.id, cost, `Rehearsal submit failed: ${id}`)
    await prisma.rehearsal.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Submit failed",
      },
    })
    const updated = await prisma.rehearsal.findUnique({ where: { id } })
    return NextResponse.json({ rehearsal: updated, error: "Submit failed" }, { status: 500 })
  }
}
