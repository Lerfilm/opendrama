/**
 * OpenRouter AI 客户端
 * 通过 OpenRouter 路由调用 MiniMax 及其他模型
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

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

  // 4. Last resort: greedy regex
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
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