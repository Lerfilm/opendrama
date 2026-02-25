/**
 * OpenRouter AI 客户端
 * 通过 OpenRouter 路由调用 MiniMax 及其他模型
 * 图像生成: google/gemini-2.5-flash-image (Nano Banana Gemini)
 */

import { jsonrepair } from "jsonrepair"
import sharp from "sharp"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const IMAGE_GEN_MODEL = "google/gemini-2.5-flash-image"

export interface AIMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface AICompletionOptions {
  messages: AIMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: "json" | "text"
  _retryCount?: number
}

export interface AICompletionResult {
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

const FALLBACK_MODEL = "google/gemini-2.0-flash-001"
const MAX_RETRIES = 2
const FETCH_TIMEOUT_MS = 45_000 // 45 seconds

/**
 * 调用 OpenRouter Chat Completion API
 * Includes automatic retry with reduced context and model fallback.
 */
export async function aiComplete(options: AICompletionOptions): Promise<AICompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY")
  }

  const retryCount = options._retryCount ?? 0
  // On second retry, fall back to a different model
  const model = retryCount >= 2
    ? FALLBACK_MODEL
    : (options.model || process.env.OPENROUTER_DEFAULT_MODEL || "minimax/minimax-01")

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.8,
    max_tokens: options.maxTokens ?? 4096,
  }

  // Note: Do NOT set response_format for MiniMax models — they don't support json_object.
  // Instead, instruct JSON output in the system prompt.

  // AbortController for fetch timeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://opendrama.ai",
        "X-Title": "OpenDrama AI",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("aborted") || msg.includes("abort")) {
      console.error(`[aiComplete] Fetch timed out after ${FETCH_TIMEOUT_MS}ms (model=${model})`)
      // Retry with fallback model on timeout
      if (retryCount < MAX_RETRIES) {
        console.log(`[aiComplete] Retry ${retryCount + 1}/${MAX_RETRIES}...`)
        return aiComplete({ ...options, _retryCount: retryCount + 1 })
      }
      throw new Error("AI API timeout — model not responding")
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const error = await res.text()
    console.error("OpenRouter API error:", res.status, error)
    // Retry on 429 (rate limit) with exponential backoff
    if (res.status === 429 && retryCount < MAX_RETRIES) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10)
      const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 3000 * Math.pow(2, retryCount)
      console.log(`[aiComplete] Rate limited (429), waiting ${backoffMs}ms before retry ${retryCount + 1}/${MAX_RETRIES}...`)
      await new Promise(r => setTimeout(r, backoffMs))
      return aiComplete({ ...options, _retryCount: retryCount + 1 })
    }
    // Retry on 5xx errors
    if (res.status >= 500 && retryCount < MAX_RETRIES) {
      console.log(`[aiComplete] Server error ${res.status}, retry ${retryCount + 1}/${MAX_RETRIES}...`)
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)))
      return aiComplete({ ...options, _retryCount: retryCount + 1 })
    }
    throw new Error(`AI API error: ${res.status} - ${error}`)
  }

  const data = await res.json()

  // Log the raw response for debugging
  if (data.error) {
    console.error("OpenRouter returned error in body:", JSON.stringify(data.error))
    // Retry on rate limit or server errors
    if (retryCount < MAX_RETRIES) {
      console.log(`[aiComplete] API error in body, retry ${retryCount + 1}/${MAX_RETRIES}...`)
      await new Promise(r => setTimeout(r, 1500 * (retryCount + 1)))
      return aiComplete({ ...options, _retryCount: retryCount + 1 })
    }
    throw new Error(`AI API error: ${data.error.message || JSON.stringify(data.error)}`)
  }

  const choice = data.choices?.[0]

  // Some models (e.g. MiniMax M2.5) put all output in `reasoning` and leave
  // `content` empty when maxTokens is exhausted by the thinking phase.
  // Fall back to the reasoning field so we don't throw away useful work.
  let content = choice?.message?.content || ""
  if (!content && choice?.message?.reasoning) {
    console.warn("[aiComplete] content empty but reasoning present — extracting from reasoning field")
    const reasoning: string = choice.message.reasoning
    // The reasoning often ends with the actual desired output after the thinking.
    // Try to find the last complete sentence or block that looks like a prompt/answer.
    // Use the last 600 chars of reasoning as a rough fallback.
    const tail = reasoning.length > 600 ? reasoning.slice(-600) : reasoning
    content = tail.trim()
  }

  if (!content) {
    console.error("Empty AI response. Full response:", JSON.stringify(data).slice(0, 500))
    if (retryCount < MAX_RETRIES) {
      console.log(`[aiComplete] Empty response, retry ${retryCount + 1}/${MAX_RETRIES} (truncating context)...`)
      // Reduce context on retry — and DOUBLE maxTokens to give reasoning models room
      const retryMessages = options.messages.map(m => ({
        ...m,
        content: m.content.length > 600 ? m.content.substring(0, 600) + "\n[truncated]" : m.content,
      }))
      const boostedTokens = Math.min((options.maxTokens ?? 1024) * 2, 4096)
      return aiComplete({ ...options, messages: retryMessages, maxTokens: boostedTokens, _retryCount: retryCount + 1 })
    }
    throw new Error("Empty AI response")
  }

  return {
    content,
    model: data.model || model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  }
}

/**
 * 从 AI 回复中提取 JSON（处理 markdown 代码块、前后缀文字等）
 */
export function extractJSON<T = Record<string, unknown>>(text: string): T {
  // 1. Try direct parse first
  try {
    return JSON.parse(text)
  } catch {
    // continue to fallback
  }

  // 2. Try extracting from markdown code block: ```json ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // continue
    }
  }

  // 3. Try extracting the outermost { ... } or [ ... ]
  // Find first { or [, then find its matching closing bracket
  const startIdx = text.search(/[{[]/)
  if (startIdx >= 0) {
    const startChar = text[startIdx]
    const endChar = startChar === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escape = false

    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i]
      if (escape) { escape = false; continue }
      if (ch === '\\' && inString) { escape = true; continue }
      if (ch === '"' && !escape) { inString = !inString; continue }
      if (inString) continue
      if (ch === startChar) depth++
      if (ch === endChar) {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(startIdx, i + 1))
          } catch {
            break
          }
        }
      }
    }
  }

  // 4. Try jsonrepair to fix malformed JSON (unescaped quotes, truncated responses, etc.)
  try {
    const startIdx2 = text.search(/[{[]/)
    const candidate = startIdx2 >= 0 ? text.slice(startIdx2) : text
    return JSON.parse(jsonrepair(candidate))
  } catch {
    // continue
  }

  // 5. Last resort: greedy regex then repair
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      try {
        return JSON.parse(jsonrepair(jsonMatch[0]))
      } catch { /* fall through */ }
    }
  }

  throw new Error(`Failed to extract JSON from AI response. Response starts with: ${text.slice(0, 200)}`)
}

/**
 * AI 剧本生成 - 系统 prompt
 */
export function buildScriptSystemPrompt(language: string = "zh") {
  if (language === "zh") {
    return `你是一位专业的短剧编剧。你需要根据用户提供的信息，创作高质量的竖屏短剧剧本。

输出格式要求（JSON）：
{
  "roles": [
    {
      "name": "角色名",
      "role": "protagonist|antagonist|supporting|minor",
      "description": "角色描述，包括年龄、性格、背景",
      "voiceType": "温柔女声|成熟男声|少年音|沧桑男声|活泼女声"
    }
  ],
  "scenes": [
    {
      "episodeNum": 1,
      "sceneNum": 1,
      "heading": "INT./EXT. 场景 - 时间",
      "action": "动作描述",
      "dialogue": [
        {"character": "角色名", "line": "台词内容", "direction": "表演指导"}
      ],
      "stageDirection": "舞台指示/镜头语言",
      "duration": 60
    }
  ]
}

写作要求：
- 每场戏 30-90 秒，节奏紧凑
- 短剧风格：强冲突、快节奏、高反转
- 竖屏构图（9:16），注意特写和近景
- 每集 3-5 场戏，总时长 2-3 分钟
- 台词口语化，贴近生活
- 每集结尾设置悬念/反转

重要：只输出纯 JSON，不要添加 markdown 代码块标记、注释或任何其他文字。`
  }

  return `You are a professional short drama scriptwriter. Create high-quality vertical short drama scripts based on user input.

Output format (JSON):
{
  "roles": [
    {
      "name": "Character name",
      "role": "protagonist|antagonist|supporting|minor",
      "description": "Character description including age, personality, background",
      "voiceType": "gentle_female|mature_male|young_male|deep_male|lively_female"
    }
  ],
  "scenes": [
    {
      "episodeNum": 1,
      "sceneNum": 1,
      "heading": "INT./EXT. Location - Time",
      "action": "Action description",
      "dialogue": [
        {"character": "Name", "line": "Dialogue", "direction": "Acting direction"}
      ],
      "stageDirection": "Stage direction / camera language",
      "duration": 60
    }
  ]
}

Requirements:
- Each scene 30-90 seconds, tight pacing
- Short drama style: strong conflict, fast pace, plot twists
- Vertical framing (9:16), focus on close-ups
- 3-5 scenes per episode, 2-3 minutes total
- Natural, conversational dialogue
- Each episode ends with a cliffhanger

IMPORTANT: Output ONLY the raw JSON object. No markdown code blocks, no comments, no other text.`
}

const IMAGE_GEN_MAX_RETRIES = 2

/**
 * Sanitize a prompt for retry after content-policy or generation failure.
 * Removes potentially problematic phrases and simplifies the prompt.
 */
function sanitizePromptForRetry(prompt: string, attempt: number): string {
  let cleaned = prompt

  // Remove words that commonly trigger safety filters
  const sensitivePatterns = [
    /\b(sexy|seductive|sensual|provocative|revealing|naked|nude|bare|undressed)\b/gi,
    /\b(blood|bloody|gore|gory|violent|gruesome|murder|kill|dead body)\b/gi,
    /\b(gun|rifle|pistol|weapon|knife|sword|blade)\b/gi,
    /\b(drug|cocaine|heroin|meth|marijuana)\b/gi,
    /\b(celebrity|real person|famous|A-list)\b/gi,
    /\b(child|children|kid|minor|baby|infant|toddler)\b/gi,
  ]
  for (const pattern of sensitivePatterns) {
    cleaned = cleaned.replace(pattern, "")
  }

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim()

  // On second retry, simplify even further — keep only the core visual description
  if (attempt >= 2) {
    // Take just the first 200 chars and append safe framing
    cleaned = cleaned.substring(0, 200).trim()
    cleaned += ". Professional photograph, studio lighting, high quality, photorealistic."
  }

  return cleaned
}

/**
 * Check if an error is retryable (content policy, rate limit, transient server error).
 * Returns a category string or null if not retryable.
 */
function classifyImageError(status: number, errorText: string): "content_policy" | "rate_limit" | "server_error" | null {
  const lower = errorText.toLowerCase()

  // Content policy / safety filter rejections
  if (
    lower.includes("safety") ||
    lower.includes("content policy") ||
    lower.includes("blocked") ||
    lower.includes("prohibited") ||
    lower.includes("harm") ||
    lower.includes("responsible ai") ||
    lower.includes("image_generation_blocked") ||
    lower.includes("finish_reason") ||
    lower.includes("recitation") ||
    status === 400
  ) {
    return "content_policy"
  }

  if (status === 429) return "rate_limit"
  if (status >= 500) return "server_error"

  return null
}

/**
 * Generate an image via OpenRouter using Google Gemini (Nano Banana).
 * Model: google/gemini-2.5-flash-image
 * Returns a base64 data URL: "data:image/png;base64,..."
 *
 * Includes automatic retry with prompt sanitization on content-policy errors
 * and exponential backoff on rate-limit / server errors.
 */
export async function aiGenerateImage(
  prompt: string,
  aspectRatio: "1:1" | "9:16" | "16:9" = "1:1",
  _retryCount = 0,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY")

  const currentPrompt = _retryCount > 0 ? sanitizePromptForRetry(prompt, _retryCount) : prompt

  if (_retryCount > 0) {
    console.log(`[aiGenerateImage] Retry ${_retryCount}/${IMAGE_GEN_MAX_RETRIES}, sanitized prompt: "${currentPrompt.substring(0, 120)}..."`)
  }

  const body: Record<string, unknown> = {
    model: IMAGE_GEN_MODEL,
    messages: [{ role: "user", content: currentPrompt }],
    modalities: ["image"],
    image_config: { aspect_ratio: aspectRatio },
  }

  // Image generation can take longer — 90 second timeout
  const imgController = new AbortController()
  const imgTimer = setTimeout(() => imgController.abort(), 90_000)

  let res: Response
  try {
    res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://opendrama.ai",
        "X-Title": "OpenDrama AI",
      },
      body: JSON.stringify(body),
      signal: imgController.signal,
    })
  } catch (err: unknown) {
    clearTimeout(imgTimer)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("aborted") || msg.includes("abort")) {
      if (_retryCount < IMAGE_GEN_MAX_RETRIES) {
        console.warn(`[aiGenerateImage] Timeout, retrying ${_retryCount + 1}/${IMAGE_GEN_MAX_RETRIES}...`)
        return aiGenerateImage(prompt, aspectRatio, _retryCount + 1)
      }
      throw new Error("Image generation timed out (90s) after retries")
    }
    throw err
  } finally {
    clearTimeout(imgTimer)
  }

  if (!res.ok) {
    const errText = await res.text()
    const errCategory = classifyImageError(res.status, errText)

    if (errCategory && _retryCount < IMAGE_GEN_MAX_RETRIES) {
      const backoffMs = errCategory === "rate_limit"
        ? 3000 * Math.pow(2, _retryCount)
        : errCategory === "server_error"
          ? 2000 * (_retryCount + 1)
          : 500 // content_policy — retry quickly with sanitized prompt
      console.warn(`[aiGenerateImage] ${errCategory} error (${res.status}), waiting ${backoffMs}ms before retry ${_retryCount + 1}/${IMAGE_GEN_MAX_RETRIES}. Error: ${errText.substring(0, 200)}`)
      await new Promise(r => setTimeout(r, backoffMs))
      return aiGenerateImage(prompt, aspectRatio, _retryCount + 1)
    }

    throw new Error(`Gemini image generation error ${res.status}: ${errText}`)
  }

  const data = await res.json()

  if (data.error) {
    const errMsg = data.error.message || JSON.stringify(data.error)
    const errCategory = classifyImageError(0, errMsg)

    if (errCategory && _retryCount < IMAGE_GEN_MAX_RETRIES) {
      console.warn(`[aiGenerateImage] ${errCategory} in response body, retry ${_retryCount + 1}/${IMAGE_GEN_MAX_RETRIES}. Error: ${errMsg.substring(0, 200)}`)
      await new Promise(r => setTimeout(r, 500))
      return aiGenerateImage(prompt, aspectRatio, _retryCount + 1)
    }

    throw new Error(`Gemini image error: ${errMsg}`)
  }

  const message = data.choices?.[0]?.message

  // Handle empty response or finish_reason indicating blocked content
  const finishReason = data.choices?.[0]?.finish_reason || ""
  if (!message || finishReason === "content_filter" || finishReason === "safety") {
    if (_retryCount < IMAGE_GEN_MAX_RETRIES) {
      console.warn(`[aiGenerateImage] Empty/blocked response (finish_reason=${finishReason}), retry ${_retryCount + 1}/${IMAGE_GEN_MAX_RETRIES}`)
      return aiGenerateImage(prompt, aspectRatio, _retryCount + 1)
    }
    throw new Error(`Image generation blocked (finish_reason=${finishReason || "empty"})`)
  }

  // Parse image from response — OpenRouter may return content as array of parts
  // or as a direct data URL string
  const content = message.content
  let rawResult: string | null = null

  if (typeof content === "string") {
    // Direct data URL or base64 string
    if (content.startsWith("data:")) rawResult = content
    // Plain base64 without prefix
    else if (content.length > 100) rawResult = `data:image/png;base64,${content}`
  }

  if (!rawResult && Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === "image_url" && part.image_url?.url) {
        rawResult = part.image_url.url; break
      }
      if (part?.type === "image" && part.image?.data) {
        rawResult = `data:${part.image.media_type || "image/png"};base64,${part.image.data}`; break
      }
    }
  }

  // Fallback: check top-level images array (some OpenRouter formats)
  if (!rawResult && Array.isArray(message.images)) {
    const img = message.images[0]
    if (img?.image_url?.url) rawResult = img.image_url.url
  }

  if (!rawResult) {
    console.error("[aiGenerateImage] Unexpected response format:", JSON.stringify(data).slice(0, 500))
    if (_retryCount < IMAGE_GEN_MAX_RETRIES) {
      console.warn(`[aiGenerateImage] Unexpected format, retry ${_retryCount + 1}/${IMAGE_GEN_MAX_RETRIES}`)
      return aiGenerateImage(prompt, aspectRatio, _retryCount + 1)
    }
    throw new Error("Could not extract image from AI response")
  }

  // If the model returned an external URL instead of base64 (e.g. signed TOS URL),
  // fetch it and convert to base64 so callers always get a permanent data URL.
  if (!rawResult.startsWith("data:")) {
    try {
      const imgRes = await fetch(rawResult)
      if (!imgRes.ok) throw new Error(`Failed to fetch image URL: ${imgRes.status}`)
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      const mime = imgRes.headers.get("content-type") || "image/jpeg"
      rawResult = `data:${mime};base64,${buffer.toString("base64")}`
    } catch (fetchErr) {
      console.warn("[aiGenerateImage] Could not fetch external image URL, storing URL as-is:", fetchErr)
      return rawResult
    }
  }

  // Apply 720p max resize to base64 data URLs before returning
  return resizeTo720p(rawResult)
}


/**
 * Resize a base64 data URL so that neither dimension exceeds 1280px (≈720p level).
 * Uses sharp. Aspect ratio is preserved. Does not enlarge small images.
 */
export async function resizeTo720p(dataUrl: string): Promise<string> {
  try {
    const b64 = dataUrl.split(",")[1]
    if (!b64) return dataUrl
    const inputBuf = Buffer.from(b64, "base64")
    const resized = await sharp(inputBuf)
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer()
    return `data:image/png;base64,${resized.toString("base64")}`
  } catch {
    // If resize fails for any reason, return original
    return dataUrl
  }
}