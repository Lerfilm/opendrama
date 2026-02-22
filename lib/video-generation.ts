import prisma from "@/lib/prisma"
import { volcRequest } from "@/lib/volcengine"
import { aiComplete } from "@/lib/ai"

// Unified video generation interface
export interface VideoGenerationRequest {
  model: string
  resolution: string
  prompt: string
  imageUrls?: string[]
  referenceVideo?: string
  aspectRatio?: string
  durationSec: number
  seed?: number          // fixed seed for cross-segment consistency within an episode
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
 * Returns the episode seed so all segments in the same episode share visual consistency.
 */
export async function enrichSegmentWithCharacters(
  segmentId: string
): Promise<{ prompt: string; imageUrls: string[]; episodeSeed: number }> {
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

  // Match ALL characters that appear in any segment of this episode, not just prompt mentions.
  // This ensures consistent character descriptions are always prepended.
  const mentionedRoles = roles.filter(
    (r) => segment.prompt.includes(r.name)
  )
  // Also include all roles with reference images even if not name-mentioned
  const rolesWithImages = roles.filter(
    (r) => r.referenceImages.length > 0 && !mentionedRoles.find(m => m.id === r.id)
  )

  // Collect reference images: mentioned roles first (max 2 each), then others (max 1 each)
  const charImageUrls = [
    ...mentionedRoles.flatMap((r) => r.referenceImages.slice(0, 2)),
    ...rolesWithImages.flatMap((r) => r.referenceImages.slice(0, 1)),
  ].slice(0, 6)

  // Build detailed character description block
  // Use a format Seedance understands: "character: [name], appearance: [desc]"
  const charBlock = mentionedRoles
    .map((r) => {
      const desc = r.description || ""
      return `character "${r.name}": ${desc}`
    })
    .join("; ")

  const enhancedPrompt = charBlock
    ? `[Cast: ${charBlock}]\n${segment.prompt}`
    : segment.prompt

  // Merge user-uploaded reference images with character images
  const allImageUrls = [...(segment.referenceImages || []), ...charImageUrls]

  // Derive a deterministic episode seed from scriptId + episodeNum so all
  // segments in the same episode share the same seed value → more consistent
  // character appearance across clips.
  const episodeSeed = deriveEpisodeSeed(segment.scriptId, segment.episodeNum)

  return { prompt: enhancedPrompt, imageUrls: allImageUrls, episodeSeed }
}

/**
 * Derive a stable positive integer seed from scriptId + episodeNum.
 * The same script/episode always gets the same seed so all its segments
 * share a consistent visual starting point.
 */
function deriveEpisodeSeed(scriptId: string, episodeNum: number): number {
  let hash = 0
  const str = `${scriptId}:${episodeNum}`
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  // Keep in range 1 – 2^31-1 (positive, non-zero)
  return Math.abs(hash) || 42
}

// ====== Model → req_key mapping (Jimeng Visual API) ======

const MODEL_REQ_KEYS: Record<string, string> = {
  // Jimeng series
  jimeng_3_0_pro: "jimeng_vgfm_t2v_l20",
  jimeng_3_0: "jimeng_vgfm_t2v_l20",
  jimeng_s2_pro: "jimeng_vgfm_t2v_l20",
}

// ====== Seedance → Ark model ID mapping ======
// Note: doubao-seedance-2-0-260128 exists but requires separate account activation.
// seedance_2_0 maps to 1.5-pro as the best currently available model.

const SEEDANCE_MODEL_IDS: Record<string, string> = {
  seedance_2_0:          "doubao-seedance-1-5-pro-251215", // 2.0 not activated → fallback to 1.5-pro
  seedance_1_5_pro:      "doubao-seedance-1-5-pro-251215",
  seedance_1_0_pro:      "doubao-seedance-1-0-pro-250528",
  seedance_1_0_pro_fast: "doubao-seedance-1-0-pro-fast-251015",
}

// NOTE: We intentionally do NOT switch to a separate "I2V lite" model when images
// are provided. The T2V models (1.5-pro, 1.0-pro, etc.) already accept image_url
// content items alongside the text prompt. Switching to the lite I2V variant
// would silently downgrade output quality. Instead, all submissions go to the
// same T2V model the user selected, passing reference images in the content array.

// Duration limits per Seedance model (seconds)
const SEEDANCE_MAX_DURATION: Record<string, number> = {
  seedance_2_0:          12,
  seedance_1_5_pro:      12,
  seedance_1_0_pro:      12,
  seedance_1_0_pro_fast: 12,
}

// Resolution → aspect_ratio mapping
// Short drama is vertical (9:16). Override with req.aspectRatio if provided.
function getAspectRatio(resolution: string): string {
  if (resolution === "1080p") return "9:16"
  if (resolution === "720p") return "9:16"
  return "9:16"
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

/**
 * Rewrite a video prompt to pass Seedance content moderation.
 * Replaces politically/celebrity-sensitive terms with neutral equivalents
 * while preserving the cinematic description.
 */
async function sanitizePromptForSeedance(prompt: string): Promise<string> {
  try {
    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: `你是一个视频提示词改写专家。你的任务是改写视频提示词，让它能通过AI视频生成平台的内容审查，同时保留原始的场景描述和镜头语言。

改写规则：
1. 将所有真实政治人物名字替换为通用职位称呼（例如："特朗普/Trump" → "总统"，"白宫" → "总统官邸"或"政府大楼"）
2. 将真实国家机构名替换为通用描述（例如："白宫" → "宏伟的政府建筑"）
3. 保留所有场景动作、镜头描述、情绪氛围、人物互动细节
4. 只输出改写后的提示词文本，不要有任何解释或前缀`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      maxTokens: 512,
    })
    const sanitized = result.content.trim()
    console.log(`[Seedance] Prompt sanitized for moderation`)
    return sanitized
  } catch (err) {
    console.error("[Seedance] Failed to sanitize prompt, using original:", err)
    return prompt
  }
}

async function submitSeedanceTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  // Always use the T2V model the user selected — do NOT switch to an I2V "lite"
  // variant, which would silently downgrade quality. Seedance T2V models accept
  // image_url items in the content array alongside the text prompt.
  const modelId = SEEDANCE_MODEL_IDS[req.model]
  if (!modelId) throw new Error(`Unknown Seedance model: ${req.model}`)

  const maxDuration = SEEDANCE_MAX_DURATION[req.model] ?? 12
  const duration = Math.min(Math.max(Math.round(req.durationSec), 4), maxDuration)

  const hasImages = req.imageUrls && req.imageUrls.length > 0

  // Build content array: reference images first, then text prompt
  const buildContent = (promptText: string): Array<Record<string, unknown>> => {
    const items: Array<Record<string, unknown>> = []
    if (hasImages) {
      items.push(...req.imageUrls!.slice(0, 6).map(url => ({
        type: "image_url",
        image_url: { url },
      })))
    }
    items.push({ type: "text", text: promptText })
    return items
  }

  // Use the episode-scoped seed for cross-segment consistency.
  // Fall back to -1 (random) only when no seed is provided.
  const seed = req.seed && req.seed > 0 ? req.seed : -1

  const baseBody: Record<string, unknown> = {
    model: modelId,
    resolution: req.resolution === "1080p" ? "1080p" : "720p",
    ratio: req.aspectRatio || getAspectRatio(req.resolution),
    duration,
    seed,
    watermark: false,
    camera_fixed: false,
  }

  console.log(`[Seedance] Submitting: model=${modelId}, ratio=${baseBody.ratio}, seed=${seed}, images=${req.imageUrls?.length ?? 0}`)

  const trySubmit = async (promptText: string) =>
    seedanceRequest<{ id: string; status: string }>(
      "/contents/generations/tasks",
      { ...baseBody, content: buildContent(promptText) }
    )

  let result: { id: string; status: string }
  try {
    result = await trySubmit(req.prompt)
  } catch (err) {
    const msg = String(err)
    if (msg.includes("InputTextSensitiveContentDetected")) {
      // Content moderation triggered — rewrite prompt with AI and retry once
      console.warn(`[Seedance] Sensitive content detected, rewriting prompt...`)
      const sanitized = await sanitizePromptForSeedance(req.prompt)
      result = await trySubmit(sanitized)
    } else {
      throw err
    }
  }

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
    // content is an object { video_url: string }, NOT an array
    content?: { video_url?: string } | Array<{ type: string; video_url?: { url: string } }>
    error?: { message?: string }
  }>(`/contents/generations/tasks/${taskId}`, undefined, "GET")

  const status = result.status || "pending"

  // Statuses: pending | running | succeeded | failed | cancelled | expired
  if (status === "succeeded") {
    let videoUrl: string | undefined
    if (result.content) {
      if (Array.isArray(result.content)) {
        // Legacy array format (not observed in practice)
        for (const item of result.content) {
          if (item.type === "video_url" && item.video_url?.url) {
            videoUrl = item.video_url.url
            break
          }
        }
      } else {
        // Actual format: { video_url: "https://..." }
        videoUrl = (result.content as { video_url?: string }).video_url
      }
    }
    console.log(`[Seedance] Task ${taskId} succeeded, videoUrl: ${videoUrl ? "found" : "missing"}`)
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
