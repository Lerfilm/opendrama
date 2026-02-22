export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete, buildScriptSystemPrompt, extractJSON } from "@/lib/ai"
import { getAvailableBalance, confirmDeduction } from "@/lib/tokens"

/**
 * AI script generation pricing:
 * MiniMax via OpenRouter costs ~$0.0000025 per token (input+output blended).
 * We charge users at cost × 2, 1 coin = $0.01.
 * So per-token cost in coins = totalTokens × 0.0000025 × 2 / 0.01
 *                             = totalTokens × 0.0005
 * Minimum charge: 1 coin.
 */
function calcScriptCostCoins(totalTokens: number): number {
  const costUSD = totalTokens * 0.0000025  // API cost
  const userCostUSD = costUSD * 2           // user pays 2×
  const coins = userCostUSD / 0.01          // 1 coin = $0.01
  return Math.max(1, Math.ceil(coins))
}

/** Generate a single episode's content and persist to DB */
async function generateEpisode(
  scriptId: string,
  userId: string,
  script: { title: string; genre: string; format: string; logline: string | null; synopsis: string | null; targetEpisodes: number; language: string },
  targetEpisode: number,
): Promise<{ rolesCreated: number; scenesCreated: number; coinsUsed: number; model: string }> {
  const systemPrompt = buildScriptSystemPrompt(script.language)
  const genreMap: Record<string, string> = {
    drama: "都市情感", comedy: "喜剧", romance: "甜宠",
    thriller: "悬疑", scifi: "科幻", fantasy: "奇幻",
  }
  const genre = script.language === "zh"
    ? (genreMap[script.genre] || script.genre)
    : script.genre

  const userPrompt = script.language === "zh"
    ? `请为以下短剧创作第${targetEpisode}集的完整剧本：

标题：${script.title}
类型：${genre}
一句话梗概：${script.logline || "暂无"}
故事大纲：${script.synopsis || "暂无"}
目标集数：${script.targetEpisodes}集
当前集数：第${targetEpisode}集（共${script.targetEpisodes}集）

请生成第${targetEpisode}集的所有场景。${targetEpisode === 1 ? "同时生成角色列表。" : "角色列表已有，只需生成scenes即可，roles数组留空[]。"}`
    : `Create the complete script for Episode ${targetEpisode} of this short drama:

Title: ${script.title}
Genre: ${genre}
Logline: ${script.logline || "N/A"}
Synopsis: ${script.synopsis || "N/A"}
Target episodes: ${script.targetEpisodes}
Current episode: ${targetEpisode} of ${script.targetEpisodes}

Generate all scenes for Episode ${targetEpisode}. ${targetEpisode === 1 ? "Also generate the roles list." : "Roles already exist — only generate scenes, return an empty roles array []."}`

  const result = await aiComplete({
    model: "anthropic/claude-sonnet-4-6",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.85,
    maxTokens: 8192,
    responseFormat: "json",
  })

  const parsed = extractJSON<{ roles?: Array<Record<string, string>>; scenes?: Array<Record<string, unknown>> }>(result.content)
  const roles = parsed.roles || []
  const scenes = parsed.scenes || []

  await Promise.all([
    ...(targetEpisode === 1
      ? roles.map((role) =>
          prisma.scriptRole.create({
            data: {
              scriptId,
              name: role.name || "未命名",
              role: role.role || "supporting",
              description: role.description || "",
              voiceType: role.voiceType || null,
            },
          })
        )
      : []
    ),
    ...scenes.map((scene, i) =>
      prisma.scriptScene.create({
        data: {
          scriptId,
          episodeNum: targetEpisode,
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

  const coinsUsed = calcScriptCostCoins(result.usage.totalTokens)
  await confirmDeduction(userId, coinsUsed, {
    type: "script_generate",
    episodeNum: targetEpisode,
    totalTokens: result.usage.totalTokens,
    model: result.model,
  }).catch(err => {
    console.error("[GenerateScript] coin deduction failed:", err)
  })

  return { rolesCreated: roles.length, scenesCreated: scenes.length, coinsUsed, model: result.model }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { scriptId, generateAll } = await req.json()

    if (!scriptId) {
      return NextResponse.json({ error: "scriptId is required" }, { status: 400 })
    }

    // Verify ownership
    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
    })

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    // Check balance
    const available = await getAvailableBalance(session.user.id)
    if (available < 1) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 })
    }

    // Determine which episodes to generate
    const existingEpisodes = await prisma.scriptScene.findMany({
      where: { scriptId },
      select: { episodeNum: true },
      distinct: ["episodeNum"],
    })
    const maxExistingEpisode = existingEpisodes.length > 0
      ? Math.max(...existingEpisodes.map(e => e.episodeNum))
      : 0

    // Episodes to generate: if generateAll, all remaining; otherwise just the next one
    const startEpisode = maxExistingEpisode + 1
    if (startEpisode > script.targetEpisodes) {
      return NextResponse.json(
        { error: `All ${script.targetEpisodes} episodes have already been generated` },
        { status: 400 }
      )
    }
    const endEpisode = generateAll ? script.targetEpisodes : startEpisode

    // Create AI job
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
          startEpisode,
          endEpisode,
          generateAll: !!generateAll,
          language: script.language,
        }),
      },
    })

    await prisma.script.update({
      where: { id: scriptId },
      data: { status: "generating" },
    })

    try {
      let totalRoles = 0
      let totalScenes = 0
      let totalCoins = 0
      let lastModel = ""
      let lastEpisode = startEpisode

      // Generate episodes sequentially (important: each episode builds on previous context)
      for (let ep = startEpisode; ep <= endEpisode; ep++) {
        const res = await generateEpisode(scriptId, session.user.id, script, ep)
        totalRoles += res.rolesCreated
        totalScenes += res.scenesCreated
        totalCoins += res.coinsUsed
        lastModel = res.model
        lastEpisode = ep

        // Update job progress
        const progress = Math.round(((ep - startEpisode + 1) / (endEpisode - startEpisode + 1)) * 100)
        await prisma.aIJob.update({
          where: { id: job.id },
          data: { progress },
        })
      }

      const isAllDone = lastEpisode >= script.targetEpisodes

      await Promise.all([
        prisma.aIJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            progress: 100,
            cost: totalCoins,
            output: JSON.stringify({
              rolesCreated: totalRoles,
              scenesCreated: totalScenes,
              episodesGenerated: endEpisode - startEpisode + 1,
              startEpisode,
              endEpisode,
              totalCoins,
              model: lastModel,
            }),
          },
        }),
        prisma.script.update({
          where: { id: scriptId },
          data: { status: isAllDone ? "completed" : "draft" },
        }),
      ])

      return NextResponse.json({
        jobId: job.id,
        status: "completed",
        episodeNum: lastEpisode,
        episodesGenerated: endEpisode - startEpisode + 1,
        rolesCreated: totalRoles,
        scenesCreated: totalScenes,
        coinsUsed: totalCoins,
        model: lastModel,
      })
    } catch (aiError) {
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
