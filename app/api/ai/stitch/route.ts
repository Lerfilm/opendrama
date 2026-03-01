export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete, extractJSON } from "@/lib/ai"
import { getAvailableBalance, directDeduction } from "@/lib/tokens"
import { checkRateLimit } from "@/lib/rate-limit"

/**
 * POST /api/ai/stitch
 * Analyzes segments for an episode and inserts bridging segments
 * to make the narrative more coherent and continuous.
 * Body: { scriptId, episodeNum }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rl = checkRateLimit(`ai:${session.user.id}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  try {
    const { scriptId, episodeNum } = await req.json()
    if (!scriptId || !episodeNum) {
      return NextResponse.json({ error: "scriptId and episodeNum required" }, { status: 400 })
    }

    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
      include: {
        scenes: { where: { episodeNum }, orderBy: { sceneNum: "asc" } },
      },
    })
    if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 })
    if (script.scenes.length < 2) {
      return NextResponse.json({ error: "Need at least 2 scenes to stitch" }, { status: 400 })
    }

    const available = await getAvailableBalance(session.user.id)
    if (available < 1) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 })
    }

    // Build scene summaries for context
    const sceneSummaries = script.scenes.map(s => {
      let actionText = ""
      if (s.action) {
        try {
          const blocks = JSON.parse(s.action) as Array<{ type: string; text?: string; line?: string; character?: string }>
          if (Array.isArray(blocks)) {
            actionText = blocks.map(b => {
              if (b.type === "dialogue") return `${b.character}: ${b.line}`
              return b.text || ""
            }).join(" ").slice(0, 300)
          }
        } catch { actionText = s.action.slice(0, 300) }
      }
      return {
        sceneNum: s.sceneNum,
        heading: s.heading || `Scene ${s.sceneNum}`,
        location: s.location || "",
        mood: s.mood || "",
        summary: actionText,
      }
    })

    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: `You are a screenplay editor specializing in narrative continuity for short-form video dramas.
Given a list of scenes, identify which adjacent pairs need bridging scenes to improve narrative flow and coherence.

For each gap that needs a bridge, create a brief bridging scene that:
- Connects the narrative logically between the two scenes
- Maintains character consistency and story continuity
- Is short (15-30 seconds) and purposeful
- Matches the tone and style of the surrounding scenes

Return ONLY valid JSON:
{
  "bridges": [
    {
      "afterSceneNum": 2,
      "heading": "INT. HALLWAY - CONTINUOUS",
      "location": "Hallway",
      "timeOfDay": "DAY",
      "mood": "tense",
      "action": [
        { "type": "action", "text": "Brief bridging action..." },
        { "type": "dialogue", "character": "CHARACTER", "parenthetical": null, "line": "Brief line" }
      ],
      "duration": 20,
      "promptHint": "Brief visual description for video generation"
    }
  ]
}

Only add bridges where genuinely needed for narrative coherence. Return empty bridges array if scenes flow well already.`,
        },
        {
          role: "user",
          content: `Episode ${episodeNum} scenes:\n\n${JSON.stringify(sceneSummaries, null, 2)}\n\nIdentify gaps and create bridging scenes.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 4096,
      responseFormat: "json",
    })

    const parsed = extractJSON<{
      bridges?: Array<{
        afterSceneNum: number
        heading?: string
        location?: string
        timeOfDay?: string
        mood?: string
        action?: unknown
        duration?: number
        promptHint?: string
      }>
    }>(result.content)

    const bridges = parsed.bridges || []

    if (bridges.length === 0) {
      return NextResponse.json({ stitched: 0, message: "Scenes already flow well — no bridges needed" })
    }

    // Insert bridge scenes into DB
    // Find max scene num to assign new scene numbers
    const maxSceneNum = Math.max(...script.scenes.map(s => s.sceneNum))

    // Re-number scenes to make room for bridges
    // For each bridge afterSceneNum N, we need to insert a scene between N and N+1
    // Strategy: assign fractional-based sort orders, then renumber
    const bridgesCreated: number[] = []
    let assignedNum = maxSceneNum + 1

    for (const bridge of bridges) {
      await prisma.scriptScene.create({
        data: {
          scriptId,
          episodeNum,
          sceneNum: assignedNum++,
          sortOrder: bridge.afterSceneNum * 100 + 50, // insert between scenes
          heading: bridge.heading || "Bridge Scene",
          location: bridge.location || "",
          timeOfDay: bridge.timeOfDay || "",
          mood: bridge.mood || "",
          action: Array.isArray(bridge.action) ? JSON.stringify(bridge.action) : (typeof bridge.action === "string" ? bridge.action : ""),
          promptHint: bridge.promptHint || "",
          duration: bridge.duration || 20,
        },
      })
      bridgesCreated.push(bridge.afterSceneNum)
    }

    // Deduct coins
    const coinsUsed = Math.max(1, Math.ceil(result.usage.totalTokens * 0.0005))
    await directDeduction(session.user.id, coinsUsed, {
      type: "stitch",
      episodeNum,
      totalTokens: result.usage.totalTokens,
      model: result.model,
    }).catch(() => {})

    return NextResponse.json({
      stitched: bridges.length,
      bridgesCreated,
      coinsUsed,
      message: `Added ${bridges.length} bridging scene${bridges.length === 1 ? "" : "s"}`,
    })
  } catch (error) {
    console.error("Stitch error:", error)
    return NextResponse.json({ error: "Stitch failed" }, { status: 500 })
  }
}
