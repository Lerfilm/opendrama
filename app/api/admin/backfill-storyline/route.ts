export const dynamic = "force-dynamic"
export const maxDuration = 300

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { extractSceneData, StorylineEntry } from "@/lib/character-analysis"

/**
 * POST /api/admin/backfill-storyline?scriptId=X
 *
 * One-time backfill for scripts imported before the DB optimization.
 * Re-computes characters[], actionPlainText, ScriptRole.storyline, and ScriptLocation
 * from existing ScriptScene.action JSON — no AI calls needed.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const scriptId = searchParams.get("scriptId")
  if (!scriptId) return NextResponse.json({ error: "scriptId required" }, { status: 400 })

  // Verify ownership
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { id: true },
  })
  if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 })

  try {
    // Fetch all scenes
    const scenes = await prisma.scriptScene.findMany({
      where: { scriptId },
      select: { id: true, episodeNum: true, sceneNum: true, heading: true, location: true, timeOfDay: true, mood: true, action: true },
      orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
    })

    const roleStorylineMap = new Map<string, StorylineEntry[]>()
    const locationMap = new Map<string, { type: string; sceneKeys: string[]; sceneDataEntries: object[] }>()

    // Process each scene
    const sceneUpdates: Array<{ id: string; characters: string[]; actionPlainText: string }> = []

    for (const scene of scenes) {
      const sceneKey = `E${scene.episodeNum}S${scene.sceneNum}`
      const blocks = (() => {
        if (!scene.action) return []
        const raw = scene.action.trim()
        if (!raw.startsWith("[")) return []
        try { return JSON.parse(raw) as Array<{ type?: string; character?: string; line?: string; text?: string }> }
        catch { return [] }
      })()

      const sceneInfo = {
        key: sceneKey,
        sceneId: scene.id,
        heading: scene.heading || "",
        location: scene.location || "",
        timeOfDay: scene.timeOfDay || "",
        mood: scene.mood || "",
      }

      const { characters, storylineEntries, actionPlainText } = extractSceneData(blocks, sceneInfo)

      sceneUpdates.push({ id: scene.id, characters, actionPlainText })

      // Accumulate character storylines
      for (const [name, entry] of Object.entries(storylineEntries)) {
        if (!roleStorylineMap.has(name)) roleStorylineMap.set(name, [])
        roleStorylineMap.get(name)!.push(entry)
      }

      // Accumulate locations
      if (scene.location) {
        const locName = scene.location.trim().toUpperCase()
        const headingUpper = (scene.heading || "").toUpperCase()
        const locType = headingUpper.startsWith("INT/EXT") || headingUpper.startsWith("I/E")
          ? "INT/EXT"
          : headingUpper.startsWith("EXT")
            ? "EXT"
            : "INT"
        if (!locationMap.has(locName)) {
          locationMap.set(locName, { type: locType, sceneKeys: [], sceneDataEntries: [] })
        }
        const loc = locationMap.get(locName)!
        loc.sceneKeys.push(sceneKey)
        loc.sceneDataEntries.push({
          key: sceneKey,
          heading: scene.heading,
          mood: scene.mood,
          timeOfDay: scene.timeOfDay,
          actionSummary: actionPlainText.substring(0, 150),
        })
      }
    }

    // Batch update ScriptScene records
    const sceneUpdateResults = await Promise.allSettled(
      sceneUpdates.map(u =>
        prisma.scriptScene.update({
          where: { id: u.id },
          data: { characters: u.characters, actionPlainText: u.actionPlainText },
        })
      )
    )
    const scenesFailed = sceneUpdateResults.filter(r => r.status === "rejected").length

    // Save role storylines
    const savedRoles = await prisma.scriptRole.findMany({
      where: { scriptId },
      select: { id: true, name: true },
    })
    const roleUpdateResults = await Promise.allSettled(
      savedRoles.map(role => {
        const entries = roleStorylineMap.get(role.name.trim().toUpperCase()) || []
        if (!entries.length) return Promise.resolve()
        return prisma.scriptRole.update({
          where: { id: role.id },
          data: { storyline: JSON.stringify(entries) },
        })
      })
    )
    const rolesFailed = roleUpdateResults.filter(r => r.status === "rejected").length

    // Save / update ScriptLocation records
    const locationUpserts = await Promise.allSettled(
      Array.from(locationMap.entries()).map(([name, data]) =>
        prisma.scriptLocation.upsert({
          where: { scriptId_name: { scriptId, name } },
          create: { scriptId, name, type: data.type, sceneKeys: data.sceneKeys, sceneData: JSON.stringify(data.sceneDataEntries) },
          update: { sceneKeys: data.sceneKeys, sceneData: JSON.stringify(data.sceneDataEntries) },
        })
      )
    )
    const locationsFailed = locationUpserts.filter(r => r.status === "rejected").length

    return NextResponse.json({
      ok: true,
      scenes: {
        total: sceneUpdates.length,
        failed: scenesFailed,
        updated: sceneUpdates.length - scenesFailed,
      },
      roles: {
        total: savedRoles.length,
        withStoryline: savedRoles.filter(r => roleStorylineMap.has(r.name.trim().toUpperCase())).length,
        failed: rolesFailed,
      },
      locations: {
        total: locationMap.size,
        failed: locationsFailed,
        created: locationMap.size - locationsFailed,
      },
    })
  } catch (error) {
    console.error("[backfill-storyline] error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
