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
    const { name, description, role, genre } = await req.json()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })

    // Step 1: Use LLM to generate a good character portrait prompt
    const llmResult = await aiComplete({
      messages: [
        {
          role: "system",
          content: `You are a casting director and visual artist for Chinese short dramas (短剧).
Generate a photorealistic character portrait prompt in English for AI image generation.

Requirements:
- 1:1 square portrait format, head and shoulders shot
- Photorealistic, cinematic quality
- Asian actor/actress appearance (unless specified otherwise)
- Clear face, good lighting, neutral to dramatic expression
- Professional headshot or film still style
- DO NOT include text, watermarks, or logos
- Output ONLY the image prompt, nothing else`,
        },
        {
          role: "user",
          content: `Character: ${name}
Role type: ${role || "supporting"}
Genre: ${genre || "drama"}
Description: ${description || "no description"}

Generate a character portrait prompt:`,
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
