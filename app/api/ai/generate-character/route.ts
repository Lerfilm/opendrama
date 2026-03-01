export const dynamic = "force-dynamic"
export const maxDuration = 120
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { chargeAiFeature } from "@/lib/ai-pricing"
import prisma from "@/lib/prisma"
import { generateCharacterPortrait } from "@/lib/image-generation"
import { checkRateLimit } from "@/lib/rate-limit"

/**
 * POST /api/ai/generate-character
 * Generate a character portrait image using AI.
 * Body: { name, description, role, genre, age, gender, height, ethnicity, physique, scriptId }
 * Returns: { imageUrl, prompt }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = checkRateLimit(`ai:${session.user.id}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  const charge = await chargeAiFeature(session.user.id, "generate_character")
  if (!charge.ok) {
    return NextResponse.json({ error: "insufficient_balance", balance: charge.balance, required: charge.required }, { status: 402 })
  }

  try {
    const { name, description, role, genre, age, gender, height, ethnicity, physique, scriptId } = await req.json()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })

    // Fetch storyline from DB for scene context
    let storylineJson: string | null = null
    if (scriptId && name) {
      try {
        const roleRecord = await prisma.scriptRole.findFirst({
          where: { scriptId, name: { equals: name, mode: "insensitive" } },
          select: { storyline: true },
        })
        if (roleRecord?.storyline) {
          storylineJson = roleRecord.storyline
          console.log("[generate-character] using storyline context")
        }
      } catch { /* ignore */ }

      // Fallback: legacy scene scan for scripts imported before optimization
      if (!storylineJson) {
        try {
          const scenes = await prisma.scriptScene.findMany({
            where: { scriptId },
            select: { episodeNum: true, sceneNum: true, heading: true, action: true },
            orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
            take: 30,
          })
          const charNameUpper = name.trim().toUpperCase()
          const charMoments: string[] = []
          for (const scene of scenes) {
            if (scene.action) {
              let actionText = scene.action.trim()
              if (actionText.startsWith("[")) {
                try { const blocks: { text?: string; line?: string }[] = JSON.parse(actionText); actionText = blocks.map(b => b.text || b.line || "").filter(Boolean).join(" ") } catch { /* keep raw */ }
              }
              if (actionText.toUpperCase().includes(charNameUpper)) {
                const sentences = actionText.split(/[.!?。！？]/).filter(s => s.toUpperCase().includes(charNameUpper))
                if (sentences.length > 0 && charMoments.length < 6) charMoments.push(`E${scene.episodeNum}S${scene.sceneNum}: ${sentences[0].trim().substring(0, 150)}`)
              }
            }
            if (charMoments.length >= 6) break
          }
          if (charMoments.length > 0) {
            // Pack as fake storyline JSON so the lib function can parse it
            storylineJson = JSON.stringify(charMoments.map(m => ({
              key: m.split(":")[0], sceneId: "", heading: "", location: "",
              timeOfDay: "", mood: "", lines: [], actions: [m.split(": ").slice(1).join(": ")],
            })))
          }
        } catch { /* ignore */ }
      }
    }

    const result = await generateCharacterPortrait({
      userId: session.user.id,
      name, description: description || "", role: role || "supporting",
      genre: genre || "drama",
      age, gender, height, ethnicity, physique,
      storylineJson,
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error("Generate character error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
