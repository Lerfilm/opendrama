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
    const { sceneId, existingHint } = await req.json()
    if (!sceneId) return NextResponse.json({ error: "sceneId required" }, { status: 400 })

    const scene = await prisma.scriptScene.findFirst({
      where: { id: sceneId },
      include: { script: { select: { userId: true, genre: true } } },
    })

    if (!scene || scene.script.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Parse action blocks to get scene content
    let sceneContent = scene.action || ""
    try {
      const blocks = JSON.parse(sceneContent)
      if (Array.isArray(blocks)) {
        sceneContent = blocks.map((b: { type: string; text?: string; character?: string; line?: string }) => {
          if (b.type === "action") return `[ACTION] ${b.text}`
          if (b.type === "dialogue") return `[${b.character}]: ${b.line}`
          if (b.type === "direction") return `[DIRECTION] ${b.text}`
          return ""
        }).join("\n")
      }
    } catch { /* use raw */ }

    const prompt = `You are a professional video production prompt writer.
Based on this scene from a ${scene.script.genre} screenplay, write a concise video generation prompt hint.

Scene heading: ${scene.heading || ""}
Location: ${scene.location || ""}
Time of day: ${scene.timeOfDay || ""}
Mood: ${scene.mood || ""}
Content:
${sceneContent.slice(0, 1000)}

${existingHint ? `Existing hint to refine: "${existingHint}"` : ""}

Write a prompt hint covering: shot type (close-up/wide/medium), camera movement, lighting, atmosphere, visual style.
Be specific and cinematic. Max 2 sentences. Return ONLY the prompt text, no explanation.`

    const result = await aiComplete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      maxTokens: 200,
    })

    const promptHint = result.content.trim().replace(/^["']|["']$/g, "")

    // Save it directly
    await prisma.scriptScene.update({
      where: { id: sceneId },
      data: { promptHint },
    })

    return NextResponse.json({ promptHint })
  } catch (error) {
    console.error("Adapt prompt error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
