export const dynamic = "force-dynamic"
export const maxDuration = 120
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { chargeAiFeatureSilent } from "@/lib/ai-pricing"
import { generateLocationPhoto } from "@/lib/image-generation"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  chargeAiFeatureSilent(session.user.id, "generate_location_photo")

  const { locName, type, description, scriptId, existingPrompt } = await req.json()

  // Fast path: read pre-computed sceneData from ScriptLocation
  let sceneDataJson: string | null = null
  let locRecord: { id: string; sceneData: string | null; photos: string | null } | null = null
  if (scriptId && locName) {
    try {
      locRecord = await prisma.scriptLocation.findFirst({
        where: { scriptId, name: { contains: locName, mode: "insensitive" } },
        select: { id: true, sceneData: true, photos: true },
      })
      if (locRecord?.sceneData) {
        sceneDataJson = locRecord.sceneData
      }
    } catch { /* ignore */ }

    // Fallback: legacy LIKE query for scripts imported before optimization
    if (!sceneDataJson) {
      try {
        const scenes = await prisma.scriptScene.findMany({
          where: {
            scriptId,
            OR: [
              { location: { contains: locName, mode: "insensitive" } },
              { heading: { contains: locName, mode: "insensitive" } },
            ],
          },
          select: { episodeNum: true, sceneNum: true, heading: true, action: true, mood: true, timeOfDay: true },
          orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
          take: 10,
        })
        if (scenes.length > 0) {
          sceneDataJson = JSON.stringify(scenes.map(scene => {
            let actionText = scene.action?.trim() || ""
            if (actionText.startsWith("[")) {
              try { const blocks: { text?: string; line?: string }[] = JSON.parse(actionText); actionText = blocks.map(b => b.text || b.line || "").filter(Boolean).join(" ") } catch { /* keep raw */ }
            }
            return {
              key: `E${scene.episodeNum}S${scene.sceneNum}`,
              heading: scene.heading || "",
              mood: scene.mood || "",
              timeOfDay: scene.timeOfDay || "",
              actionSummary: actionText.substring(0, 200),
            }
          }))
        }
      } catch { /* ignore */ }
    }
  }

  const result = await generateLocationPhoto({
    userId: session.user.id,
    locName, type: type || "INT",
    description, sceneDataJson,
    existingPrompt,
  })

  // Save photo result back to ScriptLocation for future reference
  if (locRecord) {
    const existing: { url: string; note?: string; isApproved?: boolean }[] = locRecord.photos ? (() => { try { return JSON.parse(locRecord.photos!) } catch { return [] } })() : []
    existing.push({ url: result.url, isApproved: false })
    prisma.scriptLocation.update({
      where: { id: locRecord.id },
      data: { photoUrl: result.url, photoPrompt: result.prompt, photos: JSON.stringify(existing) },
    }).catch(err => console.warn("[generate-location-photo] save back failed:", err))
  }

  return Response.json(result)
}
