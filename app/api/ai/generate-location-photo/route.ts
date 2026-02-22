export const dynamic = "force-dynamic"
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, storagePath, isStorageConfigured } from "@/lib/storage"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { locName, type, description } = await req.json()

  // Use scout notes as prompt if available; otherwise build from name + type
  const promptDesc =
    (description as string)?.trim() ||
    `a ${type === "EXT" ? "exterior outdoor" : type === "INT" ? "interior indoor" : "film"} location called "${locName}"`

  const prompt = `Cinematic location scout reference photo. ${promptDesc}. Wide lens, natural lighting, highly detailed, photorealistic, film production quality.`

  const b64DataUrl = await aiGenerateImage(prompt, "16:9")

  // Always start with base64 fallback, only replace with storage URL if upload succeeds
  let url: string = b64DataUrl
  if (isStorageConfigured() && b64DataUrl.startsWith("data:")) {
    try {
      const b64 = b64DataUrl.split(",")[1]
      const buffer = Buffer.from(b64, "base64")
      const path = storagePath(session.user.id, "scene-images", `loc-${Date.now()}.png`)
      url = await uploadToStorage("scene-images", path, buffer, "image/png")
    } catch {
      // Storage upload failed (e.g. bucket not public) — base64 URL is already set
    }
  }

  return Response.json({ url })
}
