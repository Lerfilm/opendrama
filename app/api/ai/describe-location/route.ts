export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { aiComplete } from "@/lib/ai"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { location, scenes } = await req.json()
    if (!location) return NextResponse.json({ error: "location required" }, { status: 400 })

    const sceneSummary = scenes?.map((s: { heading?: string; timeOfDay?: string; mood?: string }) =>
      `- ${s.heading || location} (${s.timeOfDay || "any time"})${s.mood ? `, mood: ${s.mood}` : ""}`
    ).join("\n") || ""

    const prompt = `You are a professional location scout for film production.
Write a detailed location scouting note for: "${location}"

This location appears in these scenes:
${sceneSummary}

Write a practical scouting note covering:
1. Visual characteristics and atmosphere
2. Lighting conditions (natural light quality, time considerations)
3. Practical requirements (power, parking, permits typical for this type of location)
4. Camera considerations (angles, movement possibilities)
5. Any special considerations based on mood/time of day

Keep it professional and under 200 words. Write as a location scout would.`

    const result = await aiComplete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      maxTokens: 400,
    })

    return NextResponse.json({ description: result.content.trim() })
  } catch (error) {
    console.error("Describe location error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
