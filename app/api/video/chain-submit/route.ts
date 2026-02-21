export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { reserveTokens, calculateTokenCost } from "@/lib/tokens"
import { runChain } from "@/lib/chain-runner"

/**
 * POST /api/video/chain-submit
 *
 * Creates video segments in "chain mode" and starts the serial chain runner.
 * In chain mode, each clip uses the previous clip's last frame as its starting image,
 * maintaining visual continuity within each scene.
 *
 * Body: { scriptId, episodeNum, model, resolution, segments: [{ segmentIndex, sceneNum, durationSec, prompt, shotType, cameraMove }] }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { scriptId, episodeNum, model, resolution, segments: segsInput } = body

  if (
    !scriptId ||
    !episodeNum ||
    !model ||
    !resolution ||
    !Array.isArray(segsInput) ||
    segsInput.length === 0
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // Verify script ownership
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
  })
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 })
  }

  // Calculate total cost (same formula as regular batch submit)
  const segCosts = segsInput.map((seg: { durationSec?: number }) =>
    calculateTokenCost(model, resolution, seg.durationSec || 15)
  )
  const totalCost = segCosts.reduce((a: number, b: number) => a + b, 0)

  // Reserve tokens upfront for the entire chain
  const reserved = await reserveTokens(
    session.user.id,
    totalCost,
    `Chain video generation: ${segsInput.length} segments for episode ${episodeNum}`
  )
  if (!reserved) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 402 })
  }

  // Delete any existing pending segments for this episode
  await prisma.videoSegment.deleteMany({
    where: { scriptId, episodeNum, status: { in: ["pending"] } },
  })

  // Create all segments with chainMode: true, status: "reserved"
  const createdSegments = await prisma.$transaction(
    segsInput.map(
      (
        seg: {
          segmentIndex: number
          sceneNum?: number
          durationSec?: number
          prompt: string
          shotType?: string
          cameraMove?: string
        },
        i: number
      ) =>
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
            chainMode: true,
          },
        })
    )
  )

  // Update script status to producing
  await prisma.script.update({
    where: { id: scriptId },
    data: { status: "producing" },
  })

  // Fire-and-forget: start the chain runner in the background
  // The HTTP response returns immediately; the chain loop runs asynchronously
  runChain(scriptId, episodeNum, session.user.id).catch((err) => {
    console.error(`[Chain] Unhandled chain runner error for script=${scriptId} ep=${episodeNum}:`, err)
  })

  return NextResponse.json({ segments: createdSegments, totalCost, mode: "chain" })
}
