/**
 * Chain Generation Runner
 *
 * Runs video segments serially, using each clip's last frame as the next
 * clip's first frame (image-to-video). Within the same scene (same sceneNum),
 * clips are chained. When the scene changes, a new seed image is generated via T2I.
 *
 * Flow:
 *   Scene N, clip 0: generateSeedImage(prompt) → I2V → extract last frame
 *   Scene N, clip 1: last frame → I2V → extract last frame
 *   ...
 *   Scene N+1, clip 0: NEW generateSeedImage(prompt) → I2V → ...
 */

import prisma from "@/lib/prisma"
import { volcRequest } from "@/lib/volcengine"
import {
  submitVideoTask,
  enrichSegmentWithCharacters,
  queryVideoTask,
} from "@/lib/video-generation"
import { confirmDeduction, refundReservation } from "@/lib/tokens"
import { extractLastFrame } from "@/lib/ffmpeg-extract"
import { mirrorUrlToStorage, isStorageConfigured } from "@/lib/storage"

// ── T2I seed image config ──────────────────────────────────────────────────
// Vertical (9:16) seed image for short drama / vertical video
const T2I_REQ_KEY = "jimeng_high_aes_general_v21_L20"
const SEED_WIDTH = 720
const SEED_HEIGHT = 1280

// ── Polling config ─────────────────────────────────────────────────────────
const T2I_MAX_POLLS = 24      // 24 × 5s = 2 min max for seed image
const T2I_POLL_INTERVAL = 5000
const VIDEO_MAX_POLLS = 150   // 150 × 8s = 20 min max per clip
const VIDEO_POLL_INTERVAL = 8000

// ──────────────────────────────────────────────────────────────────────────
// Seed image generation (Jimeng T2I)
// ──────────────────────────────────────────────────────────────────────────

async function generateSeedImage(prompt: string): Promise<string> {
  console.log("[Chain] Generating T2I seed image...")

  const submitResult = await volcRequest<{ task_id: string }>(
    "CVSync2AsyncSubmitTask",
    {
      req_key: T2I_REQ_KEY,
      prompt,
      width: SEED_WIDTH,
      height: SEED_HEIGHT,
      return_url: true,
      logo_info: { add_logo: false },
    }
  )

  if (!submitResult.task_id) {
    throw new Error(`T2I seed image submission failed: no task_id. ${JSON.stringify(submitResult)}`)
  }

  const taskId = submitResult.task_id
  console.log(`[Chain] T2I task submitted: ${taskId}`)

  for (let i = 0; i < T2I_MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, T2I_POLL_INTERVAL))

    const result = await volcRequest<{
      task_id: string
      status: string
      resp_data?: string
    }>("CVSync2AsyncGetResult", { req_key: T2I_REQ_KEY, task_id: taskId })

    if (result.status === "done" && result.resp_data) {
      try {
        const data = JSON.parse(result.resp_data)
        const imageUrl =
          data.image_urls?.[0] ||
          data.images?.[0] ||
          data.url ||
          undefined
        if (!imageUrl) throw new Error("T2I done but no image URL in response")
        console.log(`[Chain] T2I seed image ready (poll ${i + 1})`)
        return imageUrl as string
      } catch (parseErr) {
        throw new Error(`Failed to parse T2I resp_data: ${parseErr}`)
      }
    }

    if (result.status === "failed" || result.status === "error") {
      throw new Error(`T2I seed image generation failed: ${JSON.stringify(result)}`)
    }
    // still pending/running — continue polling
  }

  throw new Error("T2I seed image timed out after 2 minutes")
}

// ──────────────────────────────────────────────────────────────────────────
// Poll a single video segment until done or failed
// ──────────────────────────────────────────────────────────────────────────

async function pollSegmentUntilDone(
  segmentId: string,
  model: string,
  providerTaskId: string,
  userId: string,
  tokenCost: number,
  durationSec: number
): Promise<string> {
  for (let i = 0; i < VIDEO_MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, VIDEO_POLL_INTERVAL))

    const result = await queryVideoTask(model, providerTaskId)

    if (result.status === "generating") {
      // Update status from "submitted" to "generating" if needed
      await prisma.videoSegment.updateMany({
        where: { id: segmentId, status: "submitted" },
        data: { status: "generating" },
      })
    }

    if (result.status === "done" && result.videoUrl) {
      // Atomic update — prevent race with frontend status poller
      const { count } = await prisma.videoSegment.updateMany({
        where: { id: segmentId, status: { in: ["submitted", "generating"] } },
        data: { status: "done", videoUrl: result.videoUrl, completedAt: new Date() },
      })
      if (count > 0) {
        await confirmDeduction(userId, tokenCost, { segmentId })
      }
      console.log(`[Chain] Segment ${segmentId} done (poll ${i + 1}): ${result.videoUrl.slice(0, 60)}`)
      return result.videoUrl
    }

    if (result.status === "failed") {
      await prisma.videoSegment.updateMany({
        where: { id: segmentId, status: { in: ["submitted", "generating"] } },
        data: { status: "failed", errorMessage: result.error || "Provider reported failure" },
      })
      await refundReservation(userId, tokenCost, `Refund: chain segment ${segmentId} failed`)
      throw new Error(`Segment ${segmentId} failed: ${result.error || "unknown"}`)
    }
  }

  // Timeout
  await prisma.videoSegment.update({
    where: { id: segmentId },
    data: { status: "failed", errorMessage: "Chain runner: timed out waiting for video" },
  })
  await refundReservation(userId, tokenCost, `Refund: chain segment ${segmentId} timed out`)
  throw new Error(`Segment ${segmentId} timed out after ${(VIDEO_MAX_POLLS * VIDEO_POLL_INTERVAL) / 60000} minutes`)
}

// ──────────────────────────────────────────────────────────────────────────
// Main chain runner
// ──────────────────────────────────────────────────────────────────────────

export async function runChain(
  scriptId: string,
  episodeNum: number,
  userId: string
): Promise<void> {
  console.log(`[Chain] Starting chain: script=${scriptId} ep=${episodeNum}`)

  const segments = await prisma.videoSegment.findMany({
    where: {
      scriptId,
      episodeNum,
      chainMode: true,
      status: "reserved",
    },
    orderBy: [
      { sceneNum: "asc" },
      { segmentIndex: "asc" },
    ],
  })

  if (segments.length === 0) {
    console.warn("[Chain] No reserved chain segments found, aborting")
    return
  }

  console.log(`[Chain] Processing ${segments.length} segments across scenes: ${[...new Set(segments.map(s => s.sceneNum))].join(", ")}`)

  let currentFrameUrl: string | null = null
  let currentSceneNum = -1

  // Detect the last segment index within each scene (to know when to stop extracting frames)
  const sceneLastIdx = new Map<number, number>()
  for (const seg of segments) {
    sceneLastIdx.set(seg.sceneNum, seg.segmentIndex)
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    console.log(`[Chain] Segment ${i + 1}/${segments.length}: id=${seg.id} sceneNum=${seg.sceneNum} segIdx=${seg.segmentIndex}`)

    try {
      // ── Step 1: Handle scene transition (new seed image) ────────────────
      if (seg.sceneNum !== currentSceneNum) {
        currentSceneNum = seg.sceneNum
        console.log(`[Chain] New scene ${currentSceneNum} — generating seed image`)

        // Use the enriched prompt for seed image (so character descriptions are included)
        const { prompt: enrichedPrompt } = await enrichSegmentWithCharacters(seg.id)
        currentFrameUrl = await generateSeedImage(enrichedPrompt)
      }

      // ── Step 2: Save seed image URL to this segment ─────────────────────
      if (currentFrameUrl) {
        // Mirror to Supabase for permanent storage if it's an external URL
        let storedSeedUrl = currentFrameUrl
        if (isStorageConfigured() && !currentFrameUrl.startsWith("data:")) {
          try {
            storedSeedUrl = await mirrorUrlToStorage(
              "seed-images",
              `${seg.scriptId}/seed-s${seg.sceneNum}-${Date.now()}.jpg`,
              currentFrameUrl
            )
          } catch (err) {
            console.warn("[Chain] Supabase seed image mirror failed:", err)
          }
        }
        await prisma.videoSegment.update({
          where: { id: seg.id },
          data: { seedImageUrl: storedSeedUrl },
        })
      }

      // ── Step 3: Submit I2V ───────────────────────────────────────────────
      const { prompt, imageUrls: charImageUrls } = await enrichSegmentWithCharacters(seg.id)

      // Chain image goes FIRST (primary visual anchor), character refs follow
      const allImageUrls = [
        ...(currentFrameUrl ? [currentFrameUrl] : []),
        ...charImageUrls,
      ]

      const { taskId } = await submitVideoTask({
        model: seg.model!,
        resolution: seg.resolution!,
        prompt,
        imageUrls: allImageUrls,
        aspectRatio: "9:16",
        durationSec: seg.durationSec,
      })

      await prisma.videoSegment.update({
        where: { id: seg.id },
        data: { status: "submitted", providerTaskId: taskId },
      })

      console.log(`[Chain] Segment ${seg.id} submitted: taskId=${taskId}`)

      // ── Step 4: Wait for completion ──────────────────────────────────────
      const videoUrl = await pollSegmentUntilDone(
        seg.id,
        seg.model!,
        taskId,
        userId,
        seg.tokenCost!,
        seg.durationSec
      )

      // ── Step 5: Extract last frame for next clip in same scene ───────────
      const isLastInScene = sceneLastIdx.get(seg.sceneNum) === seg.segmentIndex
      if (!isLastInScene) {
        console.log(`[Chain] Extracting last frame from segment ${seg.segmentIndex}...`)
        currentFrameUrl = await extractLastFrame(videoUrl, seg.durationSec)
        console.log(`[Chain] Frame extracted (${Math.round(currentFrameUrl.length / 1024)}KB base64)`)
      } else {
        // Scene boundary — next segment will generate a new seed image
        currentFrameUrl = null
      }
    } catch (err) {
      console.error(`[Chain] Fatal error at segment ${i + 1} (${seg.id}):`, err)

      // Mark remaining segments as failed
      const remaining = segments.slice(i + 1)
      if (remaining.length > 0) {
        const remainingIds = remaining.map(s => s.id)
        await prisma.videoSegment.updateMany({
          where: { id: { in: remainingIds }, status: { in: ["reserved", "submitted", "generating"] } },
          data: { status: "failed", errorMessage: "Chain aborted: previous segment failed" },
        })

        // Refund tokens for remaining reserved segments
        const reservedRemaining = remaining.filter(
          s => s.status === "reserved" && (s.tokenCost ?? 0) > 0
        )
        const remainingCost = reservedRemaining.reduce((sum, s) => sum + (s.tokenCost ?? 0), 0)
        if (remainingCost > 0) {
          await refundReservation(
            userId,
            remainingCost,
            `Refund: chain aborted at segment index ${seg.segmentIndex}`
          )
        }
      }
      return
    }
  }

  console.log(`[Chain] All ${segments.length} segments completed successfully!`)
}
