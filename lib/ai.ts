/**
 * OpenRouter AI 客户端
 * 通过 OpenRouter 路由调用 MiniMax 及其他模型
 * 图像生成: Nano Banano 2 (Gemini 3.1 Flash Image Preview) via OpenRouter
 */

import { jsonrepair } from "jsonrepair"
import sharp from "sharp"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

// Nano Banano 2 image generation via OpenRouter
const IMAGE_GEN_MODEL = "google/gemini-3.1-flash-image-preview"

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
      "location": "场景名称",
      "timeOfDay": "DAY/NIGHT/DAWN/DUSK",
      "mood": "情绪氛围",
      "action": [
        {"type": "action", "text": "场景开头的动作/环境描写。现在时态，写我们看到和听到的。"},
        {"type": "dialogue", "character": "角色名", "parenthetical": "(语气/表演指导)", "line": "台词内容"},
        {"type": "action", "text": "角色的反应、动作描写"},
        {"type": "dialogue", "character": "另一角色", "parenthetical": "", "line": "回应台词"},
        {"type": "direction", "text": "(镜头指示：推近/拉远/特写等)"}
      ],
      "duration": 60
    }
  ]
}

关于 action 数组的格式说明：
- action 字段是一个 JSON 数组，包含交替出现的动作、台词和镜头指示
- type "action"：动作/场景描写，用现在时态
- type "dialogue"：角色台词，character 是角色名（大写），parenthetical 是表演指导（可为空字符串），line 是台词
- type "direction"：镜头语言/舞台指示
- 每场戏至少包含 2-3 段台词对话
- 台词应该推动剧情发展，展现角色性格

写作要求：
- 每场戏 30-90 秒，节奏紧凑
- 短剧风格：强冲突、快节奏、高反转
- 竖屏构图（9:16），注意特写和近景
- 每集 3-5 场戏，总时长 2-3 分钟
- 台词口语化，贴近生活，每场戏必须有台词
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
      "location": "Location name",
      "timeOfDay": "DAY/NIGHT/DAWN/DUSK",
      "mood": "Emotional tone",
      "action": [
        {"type": "action", "text": "Opening action/scene description. Present tense. What we see and hear."},
        {"type": "dialogue", "character": "CHARACTER NAME", "parenthetical": "(tone/direction)", "line": "Dialogue text"},
        {"type": "action", "text": "Character reactions, physical actions"},
        {"type": "dialogue", "character": "OTHER CHARACTER", "parenthetical": "", "line": "Response dialogue"},
        {"type": "direction", "text": "(Camera direction: push in / pull back / close-up etc.)"}
      ],
      "duration": 60
    }
  ]
}

About the action array format:
- The "action" field is a JSON array of interleaved action, dialogue, and direction blocks
- type "action": scene description / physical action, written in present tense
- type "dialogue": character speech. "character" is the name (UPPERCASE), "parenthetical" is acting direction (can be empty string), "line" is the dialogue text
- type "direction": camera/stage directions
- Each scene must include at least 2-3 dialogue exchanges
- Dialogue should advance the plot and reveal character

Requirements:
- Each scene 30-90 seconds, tight pacing
- Short drama style: strong conflict, fast pace, plot twists
- Vertical framing (9:16), focus on close-ups
- 3-5 scenes per episode, 2-3 minutes total
- Natural, conversational dialogue — every scene MUST have dialogue
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
 * Generate an image via OpenRouter using Nano Banano 2 (Gemini 3.1 Flash Image Preview).
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

  // Map aspect ratios for Nano Banano 2
  const aspectMap: Record<string, string> = { "1:1": "1:1", "9:16": "9:16", "16:9": "16:9" }

  const body = {
    model: IMAGE_GEN_MODEL,
    messages: [{ role: "user", content: currentPrompt }],
    modalities: ["image", "text"],
    image_config: {
      aspectRatio: aspectMap[aspectRatio] || "1:1",
      imageSize: "1K",
    },
  }

  // Image generation can take longer — 120 second timeout
  const imgController = new AbortController()
  const imgTimer = setTimeout(() => imgController.abort(), 120_000)

  let res: Response
  try {
    res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
      throw new Error("Image generation timed out (120s) after retries")
    }
    throw err
  } finally {
    clearTimeout(imgTimer)
  }

  if (!res.ok) {
    const errText = await res.text()
    const lower = errText.toLowerCase()

    const isContentPolicy = lower.includes("sensitive") || lower.includes("blocked") ||
      lower.includes("content") || lower.includes("safety") || lower.includes("prohibited") ||
      res.status === 400
    const isRateLimit = res.status === 429
    const isServerError = res.status >= 500

    if ((isContentPolicy || isRateLimit || isServerError) && _retryCount < IMAGE_GEN_MAX_RETRIES) {
      const backoffMs = isRateLimit ? 3000 * Math.pow(2, _retryCount)
        : isServerError ? 2000 * (_retryCount + 1)
        : 500
      console.warn(`[aiGenerateImage] Error (${res.status}), waiting ${backoffMs}ms before retry ${_retryCount + 1}/${IMAGE_GEN_MAX_RETRIES}. Error: ${errText.substring(0, 200)}`)
      await new Promise(r => setTimeout(r, backoffMs))
      return aiGenerateImage(prompt, aspectRatio, _retryCount + 1)
    }

    throw new Error(`Image generation error ${res.status}: ${errText.substring(0, 500)}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any

  // Extract image from OpenRouter response formats
  let rawResult: string | null = null

  // Format 1: message.images array (OpenRouter image gen)
  const images = data.choices?.[0]?.message?.images
  if (images && images.length > 0) {
    const imgUrl = images[0].image_url?.url || images[0].url
    if (imgUrl) rawResult = imgUrl
  }

  // Format 2: message.content as array with image parts
  if (!rawResult) {
    const content = data.choices?.[0]?.message?.content
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          rawResult = part.image_url.url
          break
        }
        if (part.type === "image" && part.data) {
          rawResult = `data:image/png;base64,${part.data}`
          break
        }
      }
    }
  }

  if (!rawResult) {
    console.error("[aiGenerateImage] No image in response:", JSON.stringify(data).slice(0, 500))
    if (_retryCount < IMAGE_GEN_MAX_RETRIES) {
      console.warn(`[aiGenerateImage] Empty response, retry ${_retryCount + 1}/${IMAGE_GEN_MAX_RETRIES}`)
      await new Promise(r => setTimeout(r, 1000))
      return aiGenerateImage(prompt, aspectRatio, _retryCount + 1)
    }
    throw new Error("No image data in response")
  }

  // If result is a URL (not data:), fetch and convert to base64
  if (!rawResult.startsWith("data:")) {
    try {
      const imgRes = await fetch(rawResult)
      if (!imgRes.ok) throw new Error(`Failed to fetch image URL: ${imgRes.status}`)
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      const mime = imgRes.headers.get("content-type") || "image/png"
      rawResult = `data:${mime};base64,${buffer.toString("base64")}`
    } catch (fetchErr) {
      console.warn("[aiGenerateImage] Could not fetch image URL, returning as-is:", fetchErr)
      return rawResult
    }
  }

  // Validate the image data is substantial (real images are >10KB)
  if (rawResult.startsWith("data:")) {
    const b64Part = rawResult.split(",")[1]
    if (b64Part) {
      const estimatedTotalSize = Math.floor(b64Part.length * 3 / 4)
      if (estimatedTotalSize < 1024) {
        console.error(`[aiGenerateImage] Image data too small (${estimatedTotalSize} bytes) — likely corrupted. Retrying...`)
        if (_retryCount < IMAGE_GEN_MAX_RETRIES) {
          return aiGenerateImage(prompt, aspectRatio, _retryCount + 1)
        }
        throw new Error(`Image generation produced corrupted data (${estimatedTotalSize} bytes)`)
      }
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