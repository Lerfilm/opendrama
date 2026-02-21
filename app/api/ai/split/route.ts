export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete, extractJSON } from "@/lib/ai"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { scriptId, episodeNum, model, resolution } = await req.json()

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
      return NextResponse.json({ error: "No scenes in this episode" }, { status: 400 })
    }

    // Build scene descriptions for the LLM
    const sceneDescriptions = script.scenes.map((s, i) => {
      const parts = [`Scene ${i + 1}:`]
      if (s.heading) parts.push(`  Heading: ${s.heading}`)
      if (s.action) parts.push(`  Action: ${s.action}`)
      if (s.stageDirection) parts.push(`  Stage Direction: ${s.stageDirection}`)
      if (s.mood) parts.push(`  Mood: ${s.mood}`)
      if (s.location) parts.push(`  Location: ${s.location}`)
      if (s.timeOfDay) parts.push(`  Time: ${s.timeOfDay}`)
      if (s.promptHint) parts.push(`  Camera Hint: ${s.promptHint}`)
      if (s.dialogue) {
        try {
          const lines = JSON.parse(s.dialogue)
          if (Array.isArray(lines) && lines.length > 0) {
            parts.push(`  Dialogue: ${lines.map((l: { character: string; line: string }) => `${l.character}: "${l.line}"`).join(" / ")}`)
          }
        } catch { /* ignore */ }
      }
      return parts.join("\n")
    }).join("\n\n")

    const characterNames = script.roles.map(r => `${r.name} (${r.role}: ${r.description || "N/A"})`).join("\n")

    const lang = script.language || "en"
    const systemPrompt = lang === "zh"
      ? `你是一位专业的短视频分镜师。将以下剧本场景拆分为多个15秒视频片段。

每个片段需要输出一个详细的视频生成 prompt，用于 AI 视频生成模型。

输出格式（JSON）：
{
  "segments": [
    {
      "segmentIndex": 0,
      "durationSec": 15,
      "prompt": "详细的视频画面描述...",
      "shotType": "wide|medium|close-up|extreme-close-up",
      "cameraMove": "static|pan|tilt|dolly|tracking|orbit"
    }
  ]
}

Prompt 写作要求：
- 必须明确描述画面中出现的角色名字（与剧本角色名完全一致）
- 描述要包括：画面构图、人物动作、表情、服装、场景环境、光线、运镜方式
- 每个片段 15 秒，整集通常拆分为 4-8 个片段
- 保持镜头语言的连贯性和节奏感
- 注意：prompt 不要包含对白文字，只描述画面

重要：只输出纯 JSON，不要添加 markdown 代码块标记、注释或任何其他文字。`
      : `You are a professional storyboard artist for short videos. Split the following script scenes into multiple 15-second video segments.

Each segment needs a detailed video generation prompt for an AI video generation model.

Output format (JSON):
{
  "segments": [
    {
      "segmentIndex": 0,
      "durationSec": 15,
      "prompt": "Detailed video scene description...",
      "shotType": "wide|medium|close-up|extreme-close-up",
      "cameraMove": "static|pan|tilt|dolly|tracking|orbit"
    }
  ]
}

Prompt requirements:
- Must explicitly name characters appearing in each segment (matching script character names exactly)
- Describe: framing, character actions, expressions, clothing, environment, lighting, camera movement
- Each segment is 15 seconds, typically 4-8 segments per episode
- Maintain visual continuity and pacing between segments
- Note: prompt describes visuals only, no dialogue text

IMPORTANT: Output ONLY the raw JSON object. No markdown code blocks, no comments, no other text.`

    const userPrompt = lang === "zh"
      ? `请将以下剧本拆分为视频片段：

剧名：${script.title}
类型：${script.genre}
第 ${episodeNum} 集

角色信息：
${characterNames}

场景内容：
${sceneDescriptions}`
      : `Split this script into video segments:

Title: ${script.title}
Genre: ${script.genre}
Episode ${episodeNum}

Characters:
${characterNames}

Scenes:
${sceneDescriptions}`

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 4096,
      responseFormat: "json",
    })

    const parsed = extractJSON<{ segments?: Array<Record<string, unknown>> }>(result.content)

    const segments = (parsed.segments || []).map((seg, i) => ({
      segmentIndex: (seg.segmentIndex as number) ?? i,
      durationSec: (seg.durationSec as number) ?? 15,
      prompt: (seg.prompt as string) || "",
      shotType: (seg.shotType as string) || "medium",
      cameraMove: (seg.cameraMove as string) || "static",
    }))

    return NextResponse.json({
      segments,
      model: result.model,
      defaultVideoModel: model || "seedance_2_0",
      defaultResolution: resolution || "720p",
    })
  } catch (error) {
    console.error("Split error:", error)
    return NextResponse.json({ error: "Split failed" }, { status: 500 })
  }
}
