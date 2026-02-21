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

// ====== Model → req_key mapping (Jimeng Visual API) ======

const MODEL_REQ_KEYS: Record<string, string> = {
  // Jimeng series
  jimeng_3_0_pro: "jimeng_vgfm_t2v_l20",
  jimeng_3_0: "jimeng_vgfm_t2v_l20",
  jimeng_s2_pro: "jimeng_vgfm_t2v_l20",
}

// ====== Seedance → Ark model ID mapping ======

const SEEDANCE_MODEL_IDS: Record<string, string> = {
  seedance_2_0:     "doubao-seedance-2-0-t2v-250610",
  seedance_1_5_pro: "doubao-seedance-1-5-pro-251215",
  seedance_1_0_pro: "doubao-seedance-1-0-pro-250528",
}

// Duration limits per Seedance model (seconds)
// seedance_1_5_pro / seedance_1_0_pro: 4–12s
// seedance_2_0: 4–15s
const SEEDANCE_MAX_DURATION: Record<string, number> = {
  seedance_2_0:     15,
  seedance_1_5_pro: 12,
  seedance_1_0_pro: 12,
}

// Resolution → aspect_ratio mapping
function getAspectRatio(resolution: string): string {
  if (resolution === "1080p") return "16:9"
  if (resolution === "720p") return "16:9"
  return "16:9"
}

// ====== Seedance (Volcengine Ark API) ======
// Submit:  POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
// Query:   GET  https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}
// Auth:    Bearer ARK_API_KEY

const SEEDANCE_BASE = "https://ark.cn-beijing.volces.com/api/v3"

async function seedanceRequest<T>(path: string, body?: Record<string, unknown>, method = "POST"): Promise<T> {
  const apiKey = process.env.ARK_API_KEY
  if (!apiKey) throw new Error("ARK_API_KEY env var not set")

  const url = `${SEEDANCE_BASE}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const json = await res.json() as Record<string, unknown>

  if (!res.ok) {
    throw new Error(`Seedance API error ${res.status}: ${JSON.stringify(json)}`)
  }

  return json as T
}

async function submitSeedanceTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  const modelId = SEEDANCE_MODEL_IDS[req.model]
  if (!modelId) throw new Error(`Unknown Seedance model: ${req.model}`)

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: req.prompt },
  ]

  // Image-to-video: prepend image references
  if (req.imageUrls && req.imageUrls.length > 0) {
    const imageItems = req.imageUrls.slice(0, 9).map(url => ({
      type: "image_url",
      image_url: { url },
    }))
    content.unshift(...imageItems)
  }

  const maxDuration = SEEDANCE_MAX_DURATION[req.model] ?? 12
  const duration = Math.min(Math.max(Math.round(req.durationSec), 4), maxDuration)

  const body: Record<string, unknown> = {
    model: modelId,
    content,
    resolution: req.resolution === "1080p" ? "1080p" : "720p",
    ratio: req.aspectRatio || "16:9",
    duration,
    seed: -1,
    watermark: false,
    camera_fixed: false,
  }

  console.log(`[Seedance] Submitting: model=${modelId}`)

  const result = await seedanceRequest<{ id: string; status: string }>(
    "/contents/generations/tasks",
    body
  )

  if (!result.id) {
    throw new Error(`Seedance submission failed: no id returned. Response: ${JSON.stringify(result)}`)
  }

  console.log(`[Seedance] Task submitted: ${result.id}`)
  return { taskId: result.id }
}

async function querySeedanceTask(model: string, taskId: string): Promise<VideoGenerationResult> {
  const result = await seedanceRequest<{
    id: string
    status: string
    content?: Array<{ type: string; video_url?: { url: string } }>
    error?: { message?: string }
  }>(`/contents/generations/tasks/${taskId}`, undefined, "GET")

  const status = result.status || "pending"

  // Statuses: pending | running | succeeded | failed | cancelled | expired
  if (status === "succeeded") {
    let videoUrl: string | undefined
    if (result.content) {
      for (const item of result.content) {
        if (item.type === "video_url" && item.video_url?.url) {
          videoUrl = item.video_url.url
          break
        }
      }
    }
    return { taskId, status: "done", videoUrl }
  }

  if (["failed", "cancelled", "expired"].includes(status)) {
    const errMsg = result.error?.message || `Task ${status}`
    return { taskId, status: "failed", error: errMsg }
  }

  // pending | running → still generating
  return { taskId, status: "generating" }
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
