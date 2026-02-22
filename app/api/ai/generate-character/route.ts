export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { chargeAiFeature } from "@/lib/ai-pricing"
import { aiComplete } from "@/lib/ai"
import { mirrorUrlToStorage, isStorageConfigured, storagePath } from "@/lib/storage"

const ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3"
const T2I_MODEL = "doubao-seedream-3-0-t2i-250415"

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

    // Step 2: Generate image via ARK API
    const apiKey = process.env.ARK_API_KEY
    if (!apiKey) throw new Error("ARK_API_KEY not set")

    const res = await fetch(`${ARK_BASE}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: T2I_MODEL,
        prompt,
        size: "1024x1024",
        n: 1,
      }),
    })

    const json = await res.json() as { data?: Array<{ url: string }>; error?: { message?: string } }

    if (!res.ok) {
      throw new Error(`ARK T2I error ${res.status}: ${JSON.stringify(json)}`)
    }

    let imageUrl = json.data?.[0]?.url
    if (!imageUrl) throw new Error("No image URL in response")

    // Mirror to Supabase for permanent storage (ARK URLs expire)
    if (isStorageConfigured()) {
      try {
        const path = storagePath(session.user.id, "role-images", `${name}-portrait.jpg`)
        imageUrl = await mirrorUrlToStorage("role-images", path, imageUrl)
      } catch (err) {
        console.warn("[generate-character] Supabase mirror failed, using ARK URL:", err)
      }
    }

    return NextResponse.json({ imageUrl, prompt })
  } catch (e) {
    console.error("Generate character error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
