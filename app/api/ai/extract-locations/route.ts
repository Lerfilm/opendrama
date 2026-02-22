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

    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
    })
    if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const systemPrompt = `You are a professional location manager for film/TV production.
Analyze the screenplay scenes and extract all unique filming locations.

For each location return:
- name: the location name exactly as used in the script (e.g. "Office Lobby", "Coffee Shop", "Emily's Apartment")
- type: "INT" | "EXT" | "INT/EXT"
- description: brief visual description of what the location looks like and feels like
- timeSlots: array of objects for each distinct time-of-day/atmosphere needed at this location, each with:
  - timeOfDay: e.g. "DAY", "NIGHT", "MORNING", "DUSK", "DAWN", "AFTERNOON"
  - mood: atmosphere e.g. "tense", "romantic", "comedic"
  - sceneNums: array of scene numbers needing this time/mood combination
  - setNotes: brief note about how the set must be dressed for this time/scene (lighting, props arrangement, etc.)
- totalScenes: total number of scenes shot here

Focus on DISTINCT locations — same location at different times = same location entry, different timeSlots.
Return JSON: { "locations": [...] }`

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract filming locations from these scenes:\n\n${sceneTexts}` },
      ],
      temperature: 0.3,
      maxTokens: 3000,
      responseFormat: "json",
    })

    const parsed = extractJSON<{
      locations: Array<{
        name: string
        type: string
        description?: string
        timeSlots?: Array<{
          timeOfDay: string
          mood?: string
          sceneNums?: number[]
          setNotes?: string
        }>
        totalScenes?: number
      }>
    }>(result.content)

    return NextResponse.json({ locations: parsed.locations || [] })
  } catch (error) {
    console.error("Extract locations error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
