export const dynamic = "force-dynamic"
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { aiComplete } from "@/lib/ai"

/**
 * POST /api/ai/fill-character-specs
 * Parse Character Description and extract casting specs.
 * Body: { name, description, role }
 * Returns: { age, gender, height, ethnicity, nationality, physique }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { name, description, role } = await req.json()
  if (!description) return Response.json({}, { status: 200 })

  const result = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a casting director. Extract physical casting specifications from a character description.
Return ONLY valid JSON with these fields (use empty string if not mentioned):
{
  "age": "e.g. 28, or 25-35",
  "gender": "Female" | "Male" | "Non-binary" | "Any" | "",
  "height": "e.g. 168cm, or 170-175cm",
  "ethnicity": "e.g. East Asian, Caucasian",
  "nationality": "e.g. Chinese, Mandarin fluent",
  "physique": "Slim" | "Athletic" | "Average" | "Curvy" | "Muscular" | "Heavy-set" | ""
}`,
      },
      {
        role: "user",
        content: `Character: ${name} (${role || "supporting"})
Description: ${description}

Extract casting specs:`,
      },
    ],
    maxTokens: 150,
  })

  try {
    const json = result.content.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "")
    return Response.json(JSON.parse(json))
  } catch {
    return Response.json({})
  }
}
