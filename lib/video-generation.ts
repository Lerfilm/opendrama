import prisma from "@/lib/prisma"
import { volcRequest } from "@/lib/volcengine"

// Unified video generation interface
export interface VideoGenerationRequest {
  model: string
  resolution: string
  prompt: string
  imageUrls?: string[]
  referenceVideo?: string
  aspectRatio?: string
  durationSec: number
}

export interface VideoGenerationResult {
  taskId: string
  status: "submitted" | "generating" | "done" | "failed"
  videoUrl?: string
  error?: string
}

/**
 * Submit a video generation task.
 * Routes to the appropriate API based on model name.
 */
export async function submitVideoTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  if (req.model.startsWith("seedance")) {
    return submitSeedanceTask(req)
  } else {
    return submitJimengTask(req)
  }
}

/**
 * Query task status.
 */
export async function queryVideoTask(model: string, taskId: string): Promise<VideoGenerationResult> {
  if (model.startsWith("seedance")) {
    return querySeedanceTask(model, taskId)
  } else {
    return queryJimengTask(model, taskId)
  }
}

/**
 * Enrich a video segment prompt with character reference images.
 * Automatically detects mentioned characters and injects their reference images.
 */
export async function enrichSegmentWithCharacters(
  segmentId: string
): Promise<{ prompt: string; imageUrls: string[] }> {
  const segment = await prisma.videoSegment.findUnique({
    where: { id: segmentId },
    include: {
      script: {
        include: { roles: true },
      },
    },
  })
  if (!segment) throw new Error("Segment not found")

  const roles = segment.script.roles

  // Match characters mentioned in the prompt
  const mentionedRoles = roles.filter(
    (r) => segment.prompt.includes(r.name)
  )

  // Collect reference images (max 2 per character, max 6 total)
  const charImageUrls = mentionedRoles
    .flatMap((r) => r.referenceImages.slice(0, 2))
    .slice(0, 6)

  // Enhance prompt with character descriptions
  const charDescriptions = mentionedRoles
    .map((r) => `[Character ${r.name}: ${r.description || ""}]`)
    .join(" ")
  const enhancedPrompt = charDescriptions
    ? `${charDescriptions}\n${segment.prompt}`
    : segment.prompt

  // Merge user-uploaded reference images with character images
  const allImageUrls = [...(segment.referenceImages || []), ...charImageUrls]

  return { prompt: enhancedPrompt, imageUrls: allImageUrls }
}

// ====== Model → req_key mapping ======

const MODEL_REQ_KEYS: Record<string, string> = {
  // Jimeng series
  jimeng_3_0_pro: "jimeng_vgfm_t2v_l20",
  jimeng_3_0: "jimeng_vgfm_t2v_l20",
  jimeng_s2_pro: "jimeng_vgfm_t2v_l20",
  // Seedance series (via Volcengine Visual API, same endpoint)
  seedance_2_0: "jimeng_vgfm_t2v_l20",
  seedance_1_5_pro: "jimeng_vgfm_t2v_l20",
}

// Resolution → aspect_ratio mapping
function getAspectRatio(resolution: string): string {
  if (resolution === "1080p") return "16:9"
  if (resolution === "720p") return "16:9"
  return "16:9"
}

// ====== Seedance (via Volcengine Visual REST API) ======

async function submitSeedanceTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  const reqKey = MODEL_REQ_KEYS[req.model]
  if (!reqKey) throw new Error(`Unknown Seedance model: ${req.model}`)

  const body: Record<string, unknown> = {
    req_key: reqKey,
    prompt: req.prompt,
    aspect_ratio: req.aspectRatio || getAspectRatio(req.resolution),
    seed: -1,
  }

  // Image-to-video mode
  if (req.imageUrls && req.imageUrls.length > 0) {
    body.image_urls = req.imageUrls
  }

  console.log(`[Seedance] Submitting task: model=${req.model}, reqKey=${reqKey}`)

  const result = await volcRequest<{ task_id: string }>(
    "CVSync2AsyncSubmitTask",
    body
  )

  if (!result.task_id) {
    throw new Error(`Seedance submission failed: no task_id returned. Response: ${JSON.stringify(result)}`)
  }

  console.log(`[Seedance] Task submitted: ${result.task_id}`)
  return { taskId: result.task_id }
}

async function querySeedanceTask(model: string, taskId: string): Promise<VideoGenerationResult> {
  const reqKey = MODEL_REQ_KEYS[model] || "jimeng_vgfm_t2v_l20"

  const result = await volcRequest<{
    task_id: string
    status: string
    resp_data?: string
  }>(
    "CVSync2AsyncGetResult",
    { req_key: reqKey, task_id: taskId }
  )

  return mapTaskResult(taskId, result)
}

// ====== Jimeng Series (Volcengine Visual REST API) ======

async function submitJimengTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  const reqKey = MODEL_REQ_KEYS[req.model]
  if (!reqKey) throw new Error(`Unknown Jimeng model: ${req.model}`)

  const body: Record<string, unknown> = {
    req_key: reqKey,
    prompt: req.prompt,
    aspect_ratio: req.aspectRatio || getAspectRatio(req.resolution),
    seed: -1,
  }

  // Image-to-video mode
  if (req.imageUrls && req.imageUrls.length > 0) {
    body.image_urls = req.imageUrls
  }

  console.log(`[Jimeng] Submitting task: model=${req.model}, reqKey=${reqKey}`)

  const result = await volcRequest<{ task_id: string }>(
    "CVSync2AsyncSubmitTask",
    body
  )

  if (!result.task_id) {
    throw new Error(`Jimeng submission failed: no task_id returned. Response: ${JSON.stringify(result)}`)
  }

  console.log(`[Jimeng] Task submitted: ${result.task_id}`)
  return { taskId: result.task_id }
}

async function queryJimengTask(model: string, taskId: string): Promise<VideoGenerationResult> {
  const reqKey = MODEL_REQ_KEYS[model] || "jimeng_vgfm_t2v_l20"

  const result = await volcRequest<{
    task_id: string
    status: string
    resp_data?: string
  }>(
    "CVSync2AsyncGetResult",
    { req_key: reqKey, task_id: taskId }
  )

  return mapTaskResult(taskId, result)
}

// ====== Shared: map Volcengine task result to our format ======

function mapTaskResult(
  taskId: string,
  result: { task_id?: string; status?: string; resp_data?: string }
): VideoGenerationResult {
  const status = result.status || "unknown"

  // Volcengine status mapping:
  // "done" → done, "generating" / "running" / "submitted" → generating, "failed" → failed
  if (status === "done") {
    // Parse resp_data to extract video URL
    let videoUrl: string | undefined
    if (result.resp_data) {
      try {
        const respData = JSON.parse(result.resp_data)
        // resp_data may contain { video_urls: [...] } or { output_video_urls: [...] }
        videoUrl =
          respData.video_urls?.[0] ||
          respData.output_video_urls?.[0] ||
          respData.video_url ||
          undefined
      } catch {
        console.warn("[VideoGen] Failed to parse resp_data:", result.resp_data)
      }
    }
    return { taskId, status: "done", videoUrl }
  }

  if (status === "failed" || status === "error") {
    return { taskId, status: "failed", error: `Task failed: ${JSON.stringify(result)}` }
  }

  // Any other status (generating, running, submitted, pending) → generating
  return { taskId, status: "generating" }
}
