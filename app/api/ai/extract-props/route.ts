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
    const { scriptId, sceneTexts } = await req.json()
    if (!scriptId) return NextResponse.json({ error: "scriptId required" }, { status: 400 })

    // Verify ownership
    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
    })
    if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const systemPrompt = `You are a professional props master for film/TV production.
Extract all physical props mentioned or implied in the screenplay scenes provided.

For each prop return:
- name: specific prop name (e.g. "Red leather handbag", "Vintage phone", "Coffee mug")
- category: one of "furniture" | "wardrobe" | "vehicle" | "food" | "weapon" | "electronic" | "document" | "other"
- description: brief visual description
- isKey: true if it's a significant story/character prop
- scenes: array of scene numbers where it appears

Focus on SPECIFIC, IDENTIFIABLE props — not generic backgrounds.
Prioritize key props that define character or drive plot.

Return JSON: { "props": [...] }`

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract props from these scenes:\n\n${sceneTexts}` },
      ],
      temperature: 0.3,
      maxTokens: 3000,
      responseFormat: "json",
    })

    const parsed = extractJSON<{
      props: Array<{
        name: string
        category: string
        description?: string
        isKey?: boolean
        scenes?: number[]
      }>
    }>(result.content)

    return NextResponse.json({ props: parsed.props || [] })
  } catch (error) {
    console.error("Extract props error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
