export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { chargeAiFeature } from "@/lib/ai-pricing"
import { aiComplete, aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, isStorageConfigured, storagePath } from "@/lib/storage"

/**
 * POST /api/ai/generate-character
 * Generate a character portrait image using AI.
 * Body: { name, description, role, genre }
 * Returns: { imageUrl }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const charge = await chargeAiFeature(session.user.id, "generate_character")
  if (!charge.ok) {
    return NextResponse.json({ error: "insufficient_balance", balance: charge.balance, required: charge.required }, { status: 402 })
  }


  try {
    const { name, description, role, genre, age, gender, height, ethnicity, physique } = await req.json()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })

    // Build physical specs line for richer prompting
    const specLines = [
      age ? `Age: ${age}` : "",
      gender ? `Gender: ${gender}` : "",
      height ? `Height: ${height}` : "",
      ethnicity ? `Ethnicity: ${ethnicity}` : "",
      physique ? `Physique: ${physique}` : "",
    ].filter(Boolean).join(", ")

    // Step 1: Use LLM to generate a good character portrait prompt
    const ethnicityNote = ethnicity
      ? `Ethnicity: ${ethnicity} — reflect this accurately in facial features.`
      : `Ethnicity: not specified — match the character's description; do NOT default to any particular ethnicity.`

    const llmResult = await aiComplete({
      messages: [
        {
          role: "system",
          content: `You are a casting director for short drama productions.
Generate a HIGHLY photorealistic character portrait prompt in English for AI image generation.

Requirements:
- 1:1 square portrait, head and shoulders or bust shot
- Ultra-realistic, 8K, RAW photo quality — NOT illustration, NOT anime, NOT painting
- Real human actor/actress appearance, pores and skin texture visible
- Natural face, professional film lighting, shallow depth of field
- Cinematic film still or professional headshot style
- Match the specified ethnicity/appearance exactly — do NOT default to any race if unspecified
- DO NOT include text, watermarks, or logos
- Output ONLY the image prompt, no explanation`,
        },
        {
          role: "user",
          content: `Character: ${name}
Role type: ${role || "supporting"}
Genre: ${genre || "drama"}
${ethnicityNote}
Physical specs: ${specLines || "not specified"}
Description: ${description || "no description"}

Generate a photorealistic portrait prompt:`,
        },
      ],
      maxTokens: 200,
    })

    const prompt = llmResult.content.trim()

    // Step 2: Generate image via OpenRouter Gemini (Nano Banana)
    const b64DataUrl = await aiGenerateImage(prompt, "1:1")

    // Upload base64 image to Supabase for permanent storage
    let imageUrl: string = b64DataUrl
    if (isStorageConfigured()) {
      try {
        const b64 = b64DataUrl.split(",")[1]
        const buffer = Buffer.from(b64, "base64")
        const path = storagePath(session.user.id, "role-images", `${name}-${Date.now()}.png`)
        imageUrl = await uploadToStorage("role-images", path, buffer, "image/png")
      } catch (err) {
        console.warn("[generate-character] Supabase upload failed, returning data URL:", err)
      }
    }

    return NextResponse.json({ imageUrl, prompt })
  } catch (e) {
    console.error("Generate character error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
