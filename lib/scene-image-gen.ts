/**
 * Background scene reference image generation.
 * Generates photorealistic 16:9 establishing shots for each scene via Nano Banana,
 * uploads to Supabase Storage, and saves the URL to ScriptScene.referenceImage.
 */

import { aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, storagePath, isStorageConfigured } from "@/lib/storage"
import prisma from "@/lib/prisma"

export interface SceneForImageGen {
  id: string
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
  mood?: string | null
  action?: string | null
}

/** Build an ultra-realistic photorealistic prompt for a scene */
function buildSceneImagePrompt(scene: SceneForImageGen): string {
  const parts: string[] = []

  if (scene.heading) parts.push(scene.heading)
  if (scene.location) parts.push(scene.location)
  if (scene.timeOfDay) parts.push(scene.timeOfDay.toLowerCase())
  if (scene.mood) parts.push(`${scene.mood} mood`)

  // Extract brief action context (action-type blocks only, skip dialogue)
  if (scene.action) {
    const raw = scene.action.trim()
    let actionText = ""
    if (raw.startsWith("[")) {
      try {
        const blocks = JSON.parse(raw) as Array<{ type?: string; text?: string; line?: string }>
        actionText = blocks
          .filter(b => b.type === "action" || (!b.type && b.text))
          .map(b => b.text || "")
          .filter(Boolean)
          .join(" ")
          .substring(0, 150)
      } catch {
        actionText = raw.replace(/\{[^}]+\}/g, "").substring(0, 150)
      }
    } else {
      actionText = raw.substring(0, 150)
    }
    if (actionText.trim()) parts.push(actionText.trim())
  }

  const sceneDesc = parts.filter(Boolean).join(", ")

  return (
    `Ultra-realistic photorealistic establishing wide shot, 8K RAW photo quality. ` +
    `${sceneDesc}. ` +
    `Cinematic wide-angle lens, natural real-world lighting, highly detailed environment. ` +
    `Shot on a cinema camera. Real photography, NOT CGI, NOT illustration, NOT anime, NOT digital art, NOT painting.`
  )
}

/**
 * Generate and save reference images for a list of scenes.
 * Runs in batches to avoid overwhelming the image API.
 * Safe to call without await (fire-and-forget).
 */
export async function generateAndSaveSceneImages(
  scenes: SceneForImageGen[],
  userId: string,
  concurrency = 2,
): Promise<void> {
  if (!scenes.length) return

  for (let i = 0; i < scenes.length; i += concurrency) {
    const batch = scenes.slice(i, i + concurrency)
    await Promise.allSettled(
      batch.map(async (scene) => {
        try {
          const prompt = buildSceneImagePrompt(scene)
          const b64DataUrl = await aiGenerateImage(prompt, "16:9")

          let imageUrl: string = b64DataUrl
          if (isStorageConfigured()) {
            const b64 = b64DataUrl.split(",")[1]
            const buffer = Buffer.from(b64, "base64")
            const path = storagePath(userId, "scene-images", `scene-ref-${scene.id}.png`)
            imageUrl = await uploadToStorage("scene-images", path, buffer, "image/png")
          }

          await prisma.scriptScene.update({
            where: { id: scene.id },
            data: { referenceImage: imageUrl },
          })
        } catch (err) {
          console.error(`[SceneImageGen] Failed for scene ${scene.id}:`, err)
        }
      }),
    )
  }
}
