export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete } from "@/lib/ai"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { sceneId } = await req.json()

    if (!sceneId) {
      return NextResponse.json({ error: "sceneId is required" }, { status: 400 })
    }

    const scene = await prisma.scriptScene.findUnique({
      where: { id: sceneId },
      include: {
        script: { select: { userId: true, genre: true, language: true, title: true } },
      },
    })

    if (!scene || scene.script.userId !== session.user.id) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 })
    }

    const lang = scene.script.language || "en"
    const systemPrompt = lang === "zh"
      ? `你是一位专业的短剧编剧润色师。请优化以下场景的描述和对白，使其更生动、更有电影感。
保持原有的故事走向和角色关系不变。
输出格式（JSON）：
{
  "heading": "润色后的场景标题",
  "action": "润色后的动作描述",
  "dialogue": [{"character": "角色名", "line": "润色后台词", "direction": "表演指导"}],
  "stageDirection": "润色后的舞台指示",
  "mood": "场景情绪",
  "promptHint": "镜头提示"
}`
      : `You are a professional short drama script polisher. Improve the following scene's descriptions and dialogue to be more vivid and cinematic.
Keep the original story direction and character relationships intact.
Output format (JSON):
{
  "heading": "Polished scene heading",
  "action": "Polished action description",
  "dialogue": [{"character": "Name", "line": "Polished line", "direction": "Acting direction"}],
  "stageDirection": "Polished stage direction",
  "mood": "Scene mood",
  "promptHint": "Camera/shot hint"
}`

    const userPrompt = lang === "zh"
      ? `请润色以下场景（剧名：${scene.script.title}，类型：${scene.script.genre}）：

场景标题：${scene.heading || "无"}
动作描述：${scene.action || "无"}
对白：${scene.dialogue || "[]"}
舞台指示：${scene.stageDirection || "无"}
当前情绪：${scene.mood || "未设定"}
当前地点：${scene.location || "未设定"}`
      : `Polish this scene (Title: ${scene.script.title}, Genre: ${scene.script.genre}):

Scene heading: ${scene.heading || "N/A"}
Action: ${scene.action || "N/A"}
Dialogue: ${scene.dialogue || "[]"}
Stage direction: ${scene.stageDirection || "N/A"}
Current mood: ${scene.mood || "Not set"}
Current location: ${scene.location || "Not set"}`

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 4096,
      responseFormat: "json",
    })

    let polished: Record<string, unknown>
    try {
      polished = JSON.parse(result.content)
    } catch {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        polished = JSON.parse(jsonMatch[0])
      } else {
        throw new Error("Failed to parse AI response")
      }
    }

    // Normalize dialogue to string
    if (polished.dialogue && typeof polished.dialogue !== "string") {
      polished.dialogue = JSON.stringify(polished.dialogue)
    }

    return NextResponse.json({
      original: {
        heading: scene.heading,
        action: scene.action,
        dialogue: scene.dialogue,
        stageDirection: scene.stageDirection,
        mood: scene.mood,
        promptHint: scene.promptHint,
      },
      polished,
      model: result.model,
    })
  } catch (error) {
    console.error("Polish error:", error)
    return NextResponse.json({ error: "Polish failed" }, { status: 500 })
  }
}
