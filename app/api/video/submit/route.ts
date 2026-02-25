export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { reserveTokens, calculateTokenCost, refundReservation } from "@/lib/tokens"
import { submitVideoTask, enrichSegmentWithCharacters } from "@/lib/video-generation"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()

  // ──────────────────────────────────────────
  // Batch submission: create segments + reserve tokens + submit
  // ──────────────────────────────────────────
  if (body.mode === "batch") {
    const { scriptId, episodeNum, model, resolution, segments: segsInput } = body

    if (!scriptId || !episodeNum || !model || !resolution || !Array.isArray(segsInput) || segsInput.length === 0) {
      return NextResponse.json({ error: "Missing required fields for batch mode" }, { status: 400 })
    }

    // Verify script ownership
    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
    })
    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    // Calculate total cost
    const segCosts = segsInput.map((seg: { durationSec?: number }) => {
      const dur = seg.durationSec || 15
      return calculateTokenCost(model, resolution, dur)
    })
    const totalCost = segCosts.reduce((sum: number, c: number) => sum + c, 0)

    // Reserve tokens
    const reserved = await reserveTokens(
      session.user.id,
      totalCost,
      `Batch video generation: ${segsInput.length} segments for episode ${episodeNum}`
    )
    if (!reserved) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 })
    }

    // Delete ALL existing segments for this episode before re-generating.
    // Refund any segments that still hold a reservation.
    const existingSegs = await prisma.videoSegment.findMany({
      where: { scriptId, episodeNum },
      select: { id: true, status: true, tokenCost: true },
    })
    const refundOld = existingSegs
      .filter(s => ["reserved", "submitted", "generating"].includes(s.status) && s.tokenCost)
      .reduce((sum, s) => sum + (s.tokenCost ?? 0), 0)
    if (refundOld > 0) {
      await refundReservation(session.user.id, refundOld, `Refund: episode ${episodeNum} re-generated (batch)`).catch(() => {})
    }
    await prisma.videoSegment.deleteMany({
      where: { scriptId, episodeNum },
    })

    // Create all segments in DB
    const createdSegments = await prisma.$transaction(
      segsInput.map((seg: { segmentIndex: number; sceneNum?: number; durationSec?: number; prompt: string; shotType?: string; cameraMove?: string }, i: number) =>
        prisma.videoSegment.create({
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
            status: "reserved",
            tokenCost: segCosts[i],
          },
        })
      )
    )

    // Update script status to producing
    await prisma.script.update({
      where: { id: scriptId },
      data: { status: "producing" },
    })

    // Sequential mode: submit only the first segment now.
    // status/route.ts will submit the next reserved segment after each one completes.
    if (createdSegments.length > 0) {
      submitSegmentToProvider(createdSegments[0].id, session.user.id).catch(err => {
        console.error(`Segment ${createdSegments[0].id} submission failed:`, err)
      })
    }

    return NextResponse.json({ segments: createdSegments, totalCost })
  }

  // ──────────────────────────────────────────
  // Single segment submission (retry / individual)
  // ──────────────────────────────────────────
  const { segmentId, prompt: promptOverride } = body

  if (segmentId) {
    const segment = await prisma.videoSegment.findUnique({
      where: { id: segmentId },
    })
    if (!segment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 })
    }

    // Use model/resolution from the segment, or from the body if provided
    const segModel = body.model || segment.model
    const segResolution = body.resolution || segment.resolution
    if (!segModel || !segResolution) {
      return NextResponse.json({ error: "Model and resolution required" }, { status: 400 })
    }

    // Update prompt if a new one was provided
    if (promptOverride) {
      await prisma.videoSegment.update({
        where: { id: segmentId },
        data: { prompt: promptOverride, model: segModel, resolution: segResolution },
      })
    }

    // Calculate cost
    const cost = calculateTokenCost(segModel, segResolution, segment.durationSec)

    // Reserve tokens
    const reserved = await reserveTokens(session.user.id, cost, `Video generation: segment ${segmentId}`)
    if (!reserved) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 })
    }

    // Update segment status (and clear old video data for re-generation)
    await prisma.videoSegment.update({
      where: { id: segmentId },
      data: {
        status: "reserved",
        tokenCost: cost,
        model: segModel,
        resolution: segResolution,
        videoUrl: null,
        providerTaskId: null,
        errorMessage: null,
        thumbnailUrl: null,
      },
    })

    try {
      // Enrich prompt with character references
      const { prompt, imageUrls, episodeSeed } = await enrichSegmentWithCharacters(segmentId)

      // Submit to video generation API
      const { taskId } = await submitVideoTask({
        model: segModel,
        resolution: segResolution,
        prompt,
        imageUrls,
        referenceVideo: segment.referenceVideo || undefined,
        durationSec: segment.durationSec,
        seed: episodeSeed,
      })

      // Update segment with task ID
      const updated = await prisma.videoSegment.update({
        where: { id: segmentId },
        data: { status: "submitted", providerTaskId: taskId },
      })

      return NextResponse.json({ segment: updated, cost })
    } catch (error) {
      // Refund on submission failure
      await refundReservation(session.user.id, cost, `Refund: video submission failed`)
      const updated = await prisma.videoSegment.update({
        where: { id: segmentId },
        data: { status: "failed", errorMessage: String(error) },
      })
      return NextResponse.json({ segment: updated, error: "Video submission failed" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "segmentId or batch mode required" }, { status: 400 })
}

// ──────────────────────────────────────────
// Helper: submit a single segment to the video provider
// ──────────────────────────────────────────
async function submitSegmentToProvider(segmentId: string, userId: string) {
  const segment = await prisma.videoSegment.findUnique({
    where: { id: segmentId },
  })
  if (!segment || !segment.model || !segment.resolution) return

  try {
    const { prompt, imageUrls, episodeSeed } = await enrichSegmentWithCharacters(segmentId)

    const { taskId } = await submitVideoTask({
      model: segment.model,
      resolution: segment.resolution,
      prompt,
      imageUrls,
      referenceVideo: segment.referenceVideo || undefined,
      durationSec: segment.durationSec,
      seed: episodeSeed,
    })

    await prisma.videoSegment.update({
      where: { id: segmentId },
      data: { status: "submitted", providerTaskId: taskId },
    })
  } catch (error) {
    // Refund this segment's cost
    if (segment.tokenCost) {
      await refundReservation(userId, segment.tokenCost, `Refund: segment ${segmentId} failed`)
    }
    await prisma.videoSegment.update({
      where: { id: segmentId },
      data: { status: "failed", errorMessage: String(error) },
    })
  }
}
