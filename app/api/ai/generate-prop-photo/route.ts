export const dynamic = "force-dynamic"
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, storagePath, isStorageConfigured } from "@/lib/storage"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { propName, category, description } = await req.json()

  const promptDesc =
    (description as string)?.trim() ||
    `a ${category && category !== "other" ? category + " prop" : "film prop"} called "${propName}"`

  const prompt = `Professional close-up reference photo of ${promptDesc}. Sharp focus, studio lighting, neutral background, ultra-realistic, 4K detail. Real photography, NOT CGI, NOT illustration, NOT digital art.`

  const b64DataUrl = await aiGenerateImage(prompt, "1:1")

  // Always start with base64 fallback, only replace with storage URL if upload succeeds
  let url: string = b64DataUrl
  if (isStorageConfigured() && b64DataUrl.startsWith("data:")) {
    try {
      const b64 = b64DataUrl.split(",")[1]
      const buffer = Buffer.from(b64, "base64")
      const path = storagePath(session.user.id, "props-images", `prop-${Date.now()}.png`)
      url = await uploadToStorage("props-images", path, buffer, "image/png")
    } catch {
      // Storage upload failed (e.g. bucket not public) — base64 URL is already set
    }
  }

  return Response.json({ url })
}
