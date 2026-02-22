export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { chargeAiFeature } from "@/lib/ai-pricing"
import { aiComplete, extractJSON } from "@/lib/ai"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const charge = await chargeAiFeature(session.user.id, "ai_suggest")
  if (!charge.ok) {
    return NextResponse.json({ error: "insufficient_balance", balance: charge.balance, required: charge.required }, { status: 402 })
  }


  try {
    const { scriptId, episodeNum } = await req.json()

    if (!scriptId || !episodeNum) {
      return NextResponse.json({ error: "scriptId and episodeNum are required" }, { status: 400 })
    }

    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
      include: {
        scenes: {
          where: { episodeNum },
          orderBy: { sortOrder: "asc" },
        },
        roles: true,
      },
    })

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    if (script.scenes.length === 0) {
      return NextResponse.json({ suggestions: [] })
    }

    const sceneSummary = script.scenes.map((s, i) => ({
      sceneNum: i + 1,
      heading: s.heading,
      action: s.action?.substring(0, 200),
      mood: s.mood,
      location: s.location,
      hasDialogue: !!s.dialogue,
      promptHint: s.promptHint,
    }))

    const lang = script.language || "en"
    const systemPrompt = lang === "zh"
      ? `你是一位专业的短剧导演。分析以下剧集的场景列表，给出改进建议。
输出格式（JSON）：
{
  "suggestions": [
    {
      "type": "pacing|camera|emotion|dialogue",
      "message": "具体建议内容",
      "sceneNumber": 1
    }
  ]
}
建议类型说明：
- pacing: 节奏建议（场景衔接、时长分配）
- camera: 镜头/构图建议
- emotion: 情绪/氛围建议
- dialogue: 对白改进建议
每类最多给出2条建议，总共不超过6条。
重要：只输出纯 JSON，不要添加 markdown 代码块标记、注释或任何其他文字。`
      : `You are a professional short drama director. Analyze the following episode's scene list and provide improvement suggestions.
Output format (JSON):
{
  "suggestions": [
    {
      "type": "pacing|camera|emotion|dialogue",
      "message": "Specific suggestion",
      "sceneNumber": 1
    }
  ]
}
Suggestion types:
- pacing: Pacing (scene transitions, duration balance)
- camera: Camera/framing suggestions
- emotion: Mood/atmosphere suggestions
- dialogue: Dialogue improvement suggestions
Max 2 suggestions per type, 6 total.
IMPORTANT: Output ONLY the raw JSON object. No markdown code blocks, no comments, no other text.`

    const userPrompt = lang === "zh"
      ? `分析以下场景并给出建议：

剧名：${script.title}
类型：${script.genre}
第 ${episodeNum} 集

场景列表：
${JSON.stringify(sceneSummary, null, 2)}

角色：${script.roles.map(r => `${r.name}(${r.role})`).join("、")}`
      : `Analyze these scenes and provide suggestions:

Title: ${script.title}
Genre: ${script.genre}
Episode ${episodeNum}

Scenes:
${JSON.stringify(sceneSummary, null, 2)}

Characters: ${script.roles.map(r => `${r.name}(${r.role})`).join(", ")}`

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 2048,
      responseFormat: "json",
    })

    const parsed = extractJSON<{ suggestions?: Array<Record<string, unknown>> }>(result.content)

    return NextResponse.json({
      suggestions: parsed.suggestions || [],
      model: result.model,
    })
  } catch (error) {
    console.error("Suggest error:", error)
    return NextResponse.json({ error: "Suggest failed" }, { status: 500 })
  }
}
