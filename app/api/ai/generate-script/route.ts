export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete, buildScriptSystemPrompt } from "@/lib/ai"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { scriptId } = await req.json()

    if (!scriptId) {
      return NextResponse.json({ error: "scriptId is required" }, { status: 400 })
    }

    // 验证所有权
    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
    })

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    // 创建 AI 任务
    const job = await prisma.aIJob.create({
      data: {
        userId: session.user.id,
        scriptId,
        type: "script_generate",
        status: "processing",
        startedAt: new Date(),
        input: JSON.stringify({
          title: script.title,
          genre: script.genre,
          format: script.format,
          logline: script.logline,
          synopsis: script.synopsis,
          targetEpisodes: script.targetEpisodes,
          language: script.language,
        }),
      },
    })

    // 更新剧本状态
    await prisma.script.update({
      where: { id: scriptId },
      data: { status: "generating" },
    })

    // 构建 AI 请求
    const systemPrompt = buildScriptSystemPrompt(script.language)
    const genreMap: Record<string, string> = {
      drama: "都市情感", comedy: "喜剧", romance: "甜宠",
      thriller: "悬疑", scifi: "科幻", fantasy: "奇幻",
    }
    const genre = script.language === "zh"
      ? (genreMap[script.genre] || script.genre)
      : script.genre

    const userPrompt = script.language === "zh"
      ? `请为以下短剧创作第1集的完整剧本：

标题：${script.title}
类型：${genre}
一句话梗概：${script.logline || "暂无"}
故事大纲：${script.synopsis || "暂无"}
目标集数：${script.targetEpisodes}集

请生成第1集的所有角色和场景。`
      : `Create the complete script for Episode 1 of this short drama:

Title: ${script.title}
Genre: ${genre}
Logline: ${script.logline || "N/A"}
Synopsis: ${script.synopsis || "N/A"}
Target episodes: ${script.targetEpisodes}

Generate all characters and scenes for Episode 1.`

    try {
      // 调用 OpenRouter MiniMax API
      const result = await aiComplete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        maxTokens: 8192,
        responseFormat: "json",
      })

      // 解析 AI 返回的 JSON
      let parsed: { roles?: Array<Record<string, string>>; scenes?: Array<Record<string, unknown>> }
      try {
        parsed = JSON.parse(result.content)
      } catch {
        // 尝试提取 JSON 块
        const jsonMatch = result.content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          throw new Error("Failed to parse AI response as JSON")
        }
      }

      const roles = parsed.roles || []
      const scenes = parsed.scenes || []

      // 批量创建角色和场景
      await Promise.all([
        ...roles.map((role) =>
          prisma.scriptRole.create({
            data: {
              scriptId,
              name: role.name || "未命名",
              role: role.role || "supporting",
              description: role.description || "",
              voiceType: role.voiceType || null,
            },
          })
        ),
        ...scenes.map((scene, i) =>
          prisma.scriptScene.create({
            data: {
              scriptId,
              episodeNum: (scene.episodeNum as number) || 1,
              sceneNum: (scene.sceneNum as number) || i + 1,
              heading: (scene.heading as string) || "",
              action: (scene.action as string) || "",
              dialogue: typeof scene.dialogue === "string"
                ? scene.dialogue
                : JSON.stringify(scene.dialogue || []),
              stageDirection: (scene.stageDirection as string) || "",
              duration: (scene.duration as number) || 60,
              sortOrder: i,
            },
          })
        ),
      ])

      // 更新任务和剧本状态
      await Promise.all([
        prisma.aIJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            progress: 100,
            output: JSON.stringify({
              rolesCreated: roles.length,
              scenesCreated: scenes.length,
              model: result.model,
              usage: result.usage,
            }),
          },
        }),
        prisma.script.update({
          where: { id: scriptId },
          data: { status: "completed" },
        }),
      ])

      return NextResponse.json({
        jobId: job.id,
        status: "completed",
        rolesCreated: roles.length,
        scenesCreated: scenes.length,
        model: result.model,
      })
    } catch (aiError) {
      // AI 调用失败
      console.error("AI generation error:", aiError)

      await Promise.all([
        prisma.aIJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            error: aiError instanceof Error ? aiError.message : "AI generation failed",
          },
        }),
        prisma.script.update({
          where: { id: scriptId },
          data: { status: "draft" },
        }),
      ])

      return NextResponse.json(
        { error: "AI generation failed", jobId: job.id },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Generate script error:", error)
    return NextResponse.json(
      { error: "Failed to generate script" },
      { status: 500 }
    )
  }
}
