import prisma from "@/lib/prisma"

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
    return querySeedanceTask(taskId)
  } else {
    return queryJimengTask(taskId)
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

// ====== Seedance (Volcengine Ark SDK) ======

async function submitSeedanceTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  // TODO: Implement Seedance 1.5 Pro / 2.0 integration
  // Uses Volcengine Ark SDK
  // Supports: text_prompt, image_url, reference_video_url
  throw new Error("Seedance integration pending - use Jimeng as fallback")
}

async function querySeedanceTask(taskId: string): Promise<VideoGenerationResult> {
  // TODO: Implement Seedance status query
  throw new Error("Seedance integration pending")
}

// ====== Jimeng Series (Volcengine Visual REST API) ======
// Auth: Region=cn-north-1, Service=cv
// Requires VOLC_ACCESSKEY and VOLC_SECRETKEY

const JIMENG_REQ_KEYS: Record<string, string> = {
  jimeng_3_0_pro: "jimeng_vgfm_t2v_l20",
  jimeng_3_0: "jimeng_vgfm_t2v_l20",
  jimeng_s2_pro: "jimeng_vgfm_t2v_l20",
}

async function submitJimengTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  const reqKey = JIMENG_REQ_KEYS[req.model]
  if (!reqKey) throw new Error(`Unknown Jimeng model: ${req.model}`)

  // TODO: Implement Volcengine API signing and submission
  // POST https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31
  // Body: { req_key, prompt, aspect_ratio, image_urls?, seed: -1 }
  // Header: HMAC-SHA256 signature auth
  // Returns: { code: 10000, data: { task_id: "xxx" } }
  throw new Error("Jimeng integration - implement volcengine API signing")
}

async function queryJimengTask(taskId: string): Promise<VideoGenerationResult> {
  // TODO: Implement Volcengine API query
  // POST https://visual.volcengineapi.com?Action=CVSync2AsyncGetResult&Version=2022-08-31
  // Body: { req_key, task_id }
  // Returns: { code: 10000, data: { status: "done", video_url: "..." } }
  throw new Error("Jimeng query - implement volcengine API signing")
}
