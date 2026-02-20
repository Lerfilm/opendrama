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

  if (options.responseFormat === "json") {
    body.response_format = { type: "json_object" }
  }

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
  const choice = data.choices?.[0]

  if (!choice?.message?.content) {
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
- 每集结尾设置悬念/反转`
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
- Each episode ends with a cliffhanger`
}

/**
 * AI 剧场对话生成 - 系统 prompt
 */
export function buildTheaterSystemPrompt(
  scenario: string,
  characters: Array<{ name: string; personality: string }>,
  language: string = "zh"
) {
  const charList = characters
    .map((c) => `- ${c.name}: ${c.personality}`)
    .join("\n")

  if (language === "zh") {
    return `你是一个互动戏剧 AI 导演。你正在主持一场实时互动剧场。

剧情设定：
${scenario}

角色列表：
${charList}

规则：
1. 根据观众投票的选择推进剧情
2. 用JSON格式输出：
{
  "narrative": "旁白描述（50字以内）",
  "messages": [
    {"role": "narrator", "content": "旁白内容"},
    {"role": "character", "character": "角色名", "content": "台词"},
    {"role": "character", "character": "角色名", "content": "台词"}
  ],
  "voteOptions": [
    {"label": "选项A标题", "description": "选项描述"},
    {"label": "选项B标题", "description": "选项描述"},
    {"label": "选项C标题", "description": "选项描述"}
  ]
}
3. 每次推进 2-4 条消息
4. 提供 2-3 个剧情走向选项供观众投票
5. 保持角色性格一致性
6. 制造悬念和冲突，保持戏剧张力`
  }

  return `You are an interactive theater AI director hosting a live interactive drama.

Scenario:
${scenario}

Characters:
${charList}

Rules:
1. Advance the plot based on audience vote choices
2. Output in JSON format:
{
  "narrative": "Brief narration (under 50 words)",
  "messages": [
    {"role": "narrator", "content": "Narration"},
    {"role": "character", "character": "Name", "content": "Dialogue"},
    {"role": "character", "character": "Name", "content": "Dialogue"}
  ],
  "voteOptions": [
    {"label": "Option A title", "description": "Option description"},
    {"label": "Option B title", "description": "Option description"},
    {"label": "Option C title", "description": "Option description"}
  ]
}
3. Advance 2-4 messages per turn
4. Provide 2-3 plot direction options for audience voting
5. Maintain character consistency
6. Create suspense and conflict`
}
