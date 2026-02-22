export const dynamic = "force-dynamic"
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { aiComplete, aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, storagePath, isStorageConfigured } from "@/lib/storage"

/**
 * POST /api/ai/generate-costume
 * Generate a full-body costume reference photo for a character in a specific scene.
 * Body: { characterName, characterDescription, gender, sceneHeading, location, timeOfDay, genre }
 * Returns: { url }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { characterName, characterDescription, gender, sceneHeading, location, timeOfDay, genre } = await req.json()

  // Build a costume prompt via LLM
  const llmResult = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a costume designer for Chinese short dramas (短剧).
Generate a photorealistic full-body costume reference prompt for AI image generation.

Requirements:
- Full body shot showing complete outfit from head to toe
- Ultra-realistic, 8K quality — NOT illustration, NOT anime
- Real fabric textures, natural lighting
- Show the costume/outfit clearly on the character
- Chinese drama aesthetic appropriate for the genre and scene setting
- Include hair, accessories, shoes if visible
- Clean background or minimal set dressing
- Output ONLY the image prompt, no explanation`,
      },
      {
        role: "user",
        content: `Character: ${characterName || "Character"}
Gender: ${gender || "unspecified"}
Scene: ${sceneHeading || location || "general scene"}
Time: ${timeOfDay || "unspecified"}
Genre: ${genre || "drama"}
Character description: ${characterDescription || "no description"}

Generate a costume reference photo prompt:`,
      },
    ],
    maxTokens: 200,
  })

  const prompt = llmResult.content.trim()
  const b64DataUrl = await aiGenerateImage(prompt, "9:16")

  let url: string = b64DataUrl
  if (isStorageConfigured()) {
    const b64 = b64DataUrl.split(",")[1]
    const buffer = Buffer.from(b64, "base64")
    const path = storagePath(session.user.id, "role-images", `costume-${Date.now()}.png`)
    url = await uploadToStorage("role-images", path, buffer, "image/png")
  }

  return Response.json({ url })
}
