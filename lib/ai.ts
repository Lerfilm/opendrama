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

/**
 * 调用 OpenRouter Chat Completion API
 */
export async function aiComplete(options: AICompletionOptions): Promise<AICompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY")
  }

  const model = options.model || process.env.OPENROUTER_DEFAULT_MODEL || "minimax/minimax-01"

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.8,
    max_tokens: options.maxTokens ?? 4096,
  }

  // Note: Do NOT set response_format for MiniMax models — they don't support json_object.
  // Instead, instruct JSON output in the system prompt.

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://opendrama.ai",
      "X-Title": "OpenDrama AI",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.text()
    console.error("OpenRouter API error:", res.status, error)
    throw new Error(`AI API error: ${res.status} - ${error}`)
  }

  const data = await res.json()

  // Log the raw response for debugging
  if (data.error) {
    console.error("OpenRouter returned error in body:", JSON.stringify(data.error))
    throw new Error(`AI API error: ${data.error.message || JSON.stringify(data.error)}`)
  }

  const choice = data.choices?.[0]

  if (!choice?.message?.content) {
    console.error("Empty AI response. Full response:", JSON.stringify(data).slice(0, 500))
    throw new Error("Empty AI response")
  }

  return {
    content: choice.message.content,
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

/**
 * Generate an image via OpenRouter using Google Gemini (Nano Banana).
 * Model: google/gemini-2.5-flash-image
 * Returns a base64 data URL: "data:image/png;base64,..."
 */
export async function aiGenerateImage(
  prompt: string,
  aspectRatio: "1:1" | "9:16" | "16:9" = "1:1",
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY")

  const body: Record<string, unknown> = {
    model: IMAGE_GEN_MODEL,
    messages: [{ role: "user", content: prompt }],
    modalities: ["image"],
    image_config: { aspect_ratio: aspectRatio },
  }

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://opendrama.ai",
      "X-Title": "OpenDrama AI",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini image generation error ${res.status}: ${errText}`)
  }

  const data = await res.json()

  if (data.error) {
    throw new Error(`Gemini image error: ${data.error.message || JSON.stringify(data.error)}`)
  }

  const message = data.choices?.[0]?.message
  if (!message) throw new Error("Empty response from image generation API")

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
    throw new Error("Could not extract image from AI response")
  }

  // Apply 720p max resize to base64 data URLs before returning
  if (rawResult.startsWith("data:")) {
    return resizeTo720p(rawResult)
  }
  return rawResult
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