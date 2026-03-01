export const dynamic = "force-dynamic"
export const maxDuration = 120
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { chargeAiFeatureSilent } from "@/lib/ai-pricing"
import { generatePropPhoto } from "@/lib/image-generation"
import { checkRateLimit } from "@/lib/rate-limit"

/** Parse action field — may be JSON blocks or plain text */
function actionToText(action: string | null | undefined): string {
  if (!action) return ""
  const raw = action.trim()
  if (raw.startsWith("[")) {
    try {
      const blocks: { text?: string; line?: string }[] = JSON.parse(raw)
      return blocks.map(b => b.text || b.line || "").filter(Boolean).join(" ")
    } catch { /* keep raw */ }
  }
  return raw
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const rl = checkRateLimit(`ai:${session.user.id}`, 20, 60_000)
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  chargeAiFeatureSilent(session.user.id, "generate_prop_photo")

  const { propName, category, description, scriptId, sceneIds } = await req.json()

  // Fast path: read pre-computed sceneData from ScriptProp
  let sceneDataJson: string | null = null
  let propRecord: { id: string; sceneData: string | null; photos: string | null } | null = null
  if (scriptId && propName) {
    try {
      propRecord = await prisma.scriptProp.findFirst({
        where: { scriptId, name: { contains: propName, mode: "insensitive" } },
        select: { id: true, sceneData: true, photos: true },
      })
      if (propRecord?.sceneData) {
        sceneDataJson = propRecord.sceneData
      }
    } catch { /* ignore */ }
  }

  // Fallback: legacy DB scan
  if (!sceneDataJson && scriptId) {
    try {
      const scenes = sceneIds?.length
        ? await prisma.scriptScene.findMany({
            where: { id: { in: sceneIds } },
            select: { episodeNum: true, sceneNum: true, heading: true, action: true, mood: true },
            orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
          })
        : await prisma.scriptScene.findMany({
            where: {
              scriptId,
              OR: [
                { actionPlainText: { contains: propName, mode: "insensitive" } },
                { action: { contains: propName, mode: "insensitive" } },
              ],
            },
            select: { episodeNum: true, sceneNum: true, heading: true, action: true, actionPlainText: true, mood: true },
            orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
            take: 5,
          })

      if (scenes.length > 0) {
        sceneDataJson = JSON.stringify(scenes.map(scene => {
          const actText: string = (("actionPlainText" in scene) ? (scene as { actionPlainText?: string | null }).actionPlainText || "" : "") || actionToText(scene.action)
          const sentences = actText.split(/[.!?。！？]/).filter((s: string) => s.toLowerCase().includes(propName.toLowerCase()))
          return {
            key: `E${scene.episodeNum}S${scene.sceneNum}`,
            heading: scene.heading || "",
            usage: sentences.slice(0, 2).join(". ").substring(0, 250),
          }
        }))
      }
    } catch { /* ignore */ }
  }

  const result = await generatePropPhoto({
    userId: session.user.id,
    propName, category: category || "other",
    description, sceneDataJson,
  })

  // Save photo result back to ScriptProp
  if (propRecord) {
    const existing: { url: string; note?: string; isApproved?: boolean }[] = propRecord.photos ? (() => { try { return JSON.parse(propRecord.photos!) } catch { return [] } })() : []
    existing.push({ url: result.url, isApproved: false })
    prisma.scriptProp.update({
      where: { id: propRecord.id },
      data: { photoUrl: result.url, photos: JSON.stringify(existing) },
    }).catch(err => console.warn("[generate-prop-photo] save back failed:", err))
  }

  return Response.json(result)
}
