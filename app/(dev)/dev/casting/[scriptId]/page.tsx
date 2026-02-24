export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { CastingWorkspace } from "./casting-workspace"

export default async function CastingPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")


  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    select: {
      id: true,
      title: true,
      genre: true,
      roles: {
        select: { id: true, name: true, role: true, description: true, voiceType: true, avatarUrl: true, referenceImages: true, storyline: true, castingSpecs: true },
        orderBy: { createdAt: "asc" },
      },
      scenes: {
        select: { id: true, episodeNum: true, sceneNum: true, heading: true, location: true, timeOfDay: true, characters: true },
        orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
      },
    },
  })

  if (!script) redirect("/dev")

  // Compute per-character scene statistics AND characterScenes map from pre-computed characters[]
  const dialogueStats: Record<string, { sceneCount: number; lineCount: number }> = {}
  const characterScenes: Record<string, string[]> = {}

  for (const scene of script.scenes) {
    const sceneKey = `E${scene.episodeNum}S${scene.sceneNum}`
    // Use pre-computed characters[] — no JSON parsing needed
    for (const charName of scene.characters) {
      const name = charName.trim().toUpperCase()
      if (!dialogueStats[name]) dialogueStats[name] = { sceneCount: 0, lineCount: 0 }
      dialogueStats[name].sceneCount++
      if (!characterScenes[name]) characterScenes[name] = []
      characterScenes[name].push(sceneKey)
    }
  }

  // Strip characters[] from scenes passed to client (embedded in characterScenes above)
  const scenesClean = script.scenes.map(({ characters: _c, ...rest }) => rest)

  return <CastingWorkspace script={{ ...script, scenes: scenesClean } as Parameters<typeof CastingWorkspace>[0]["script"]} dialogueStats={dialogueStats} characterScenes={characterScenes} />
}
