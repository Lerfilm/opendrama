export const dynamic = "force-dynamic"
export const maxDuration = 120
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { aiComplete, aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, storagePath, isStorageConfigured } from "@/lib/storage"
import prisma from "@/lib/prisma"
import { chargeAiFeatureSilent } from "@/lib/ai-pricing"
import { StorylineEntry } from "@/lib/character-analysis"

/** Parse dialogue JSON into readable text */
function dialogueToText(dialogueJson: string | null | undefined): string {
  if (!dialogueJson) return ""
  try {
    const lines: { character?: string; line?: string; direction?: string }[] = JSON.parse(dialogueJson)
    return lines
      .map(l => `${l.character || "??"}: ${l.line || ""}${l.direction ? ` (${l.direction})` : ""}`)
      .join("\n")
  } catch {
    return dialogueJson.substring(0, 500)
  }
}

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

/**
 * POST /api/ai/generate-costume
 * Generate a full-body costume reference photo for a character in a specific scene.
 * Body: { characterName, characterDescription, gender, sceneId, sceneHeading, location, timeOfDay, genre, age, physique, ethnicity, roleType }
 * Returns: { url }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  chargeAiFeatureSilent(session.user.id, "generate_costume")

  const { characterName, characterDescription, gender, sceneId, sceneKey, scriptId, sceneHeading, location, timeOfDay, genre, age, physique, ethnicity, roleType } = await req.json()

  // Fetch scene content — fast path: read from pre-computed role storyline entry
  let sceneContent = ""
  if (scriptId && characterName && sceneKey) {
    try {
      const roleRecord = await prisma.scriptRole.findFirst({
        where: { scriptId, name: { equals: characterName, mode: "insensitive" } },
        select: { storyline: true },
      })
      if (roleRecord?.storyline) {
        const storyline: StorylineEntry[] = JSON.parse(roleRecord.storyline)
        const entry = storyline.find(s => s.key === sceneKey)
        if (entry) {
          sceneContent = [
            `Scene: ${entry.heading}`,
            `Mood: ${entry.mood}`,
            `Location: ${entry.location}`,
            `Time: ${entry.timeOfDay}`,
            entry.actions.length ? `Action: ${entry.actions.join(". ")}` : "",
            entry.lines.length ? `Dialogue: ${entry.lines.map(l => `"${l}"`).join(" / ")}` : "",
          ].filter(Boolean).join("\n")
        }
      }
    } catch { /* ignore, fallback below */ }
  }

  // Fallback: fetch full scene from DB by sceneId (legacy path)
  if (!sceneContent && sceneId) {
    const scene = await prisma.scriptScene.findUnique({
      where: { id: sceneId },
      select: { heading: true, action: true, dialogue: true, stageDirection: true, mood: true, location: true, timeOfDay: true },
    })
    if (scene) {
      const parts: string[] = []
      if (scene.heading) parts.push(`Scene: ${scene.heading}`)
      if (scene.mood) parts.push(`Mood: ${scene.mood}`)
      const act = actionToText(scene.action)
      if (act) parts.push(`Action: ${act.substring(0, 400)}`)
      const dlg = dialogueToText(scene.dialogue)
      if (dlg) parts.push(`Dialogue:\n${dlg.substring(0, 500)}`)
      if (scene.stageDirection) parts.push(`Stage Direction: ${scene.stageDirection.substring(0, 200)}`)
      sceneContent = parts.join("\n")
    }
  }

  // Build a costume prompt via LLM
  const llmResult = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a costume designer for short drama productions.
Generate a photorealistic full-body costume reference prompt for AI image generation.

CRITICAL: You must read the FULL SCENE CONTENT below carefully. The costume must match:
1. What the character is doing in the scene (action, activities)
2. The scene location and setting (indoor/outdoor, formal/casual)
3. The time of day and mood/atmosphere
4. The character's status, emotion, and social context from dialogue

Requirements:
- Full body shot showing complete outfit from head to toe
- Ultra-realistic, 8K quality — NOT illustration, NOT anime
- Real fabric textures, natural lighting
- Show the costume/outfit clearly on the character
- IMPORTANT: The character should be ATTRACTIVE and GOOD-LOOKING. Think professional actor/actress — beautiful or handsome, well-groomed, photogenic. Even elderly characters should look distinguished and elegant.
- Drama aesthetic appropriate for the genre and scene setting
- Include hair styling, makeup, accessories, shoes
- Clean background or minimal set dressing matching the scene location
- Output ONLY the image prompt, no explanation`,
      },
      {
        role: "user",
        content: `Character: ${characterName || "Character"}
Gender: ${gender || "unspecified"}
Age: ${age || "unspecified"}
Physique: ${physique || "unspecified"}
Ethnicity: ${ethnicity || "unspecified"}
Role: ${roleType || "supporting"}
Scene: ${sceneHeading || location || "general scene"}
Time: ${timeOfDay || "unspecified"}
Genre: ${genre || "drama"}
Character description: ${characterDescription || "no description"}

${sceneContent ? `--- FULL SCENE CONTENT (read carefully for costume context) ---\n${sceneContent}\n---` : ""}

Based on the scene content above, generate a costume reference photo prompt that matches what the character would wear in this specific scene:`,
      },
    ],
    maxTokens: 250,
  })

  const prompt = llmResult.content.trim()
  const b64DataUrl = await aiGenerateImage(prompt, "9:16")

  let url: string = b64DataUrl
  if (isStorageConfigured() && b64DataUrl.startsWith("data:")) {
    try {
      const b64 = b64DataUrl.split(",")[1]
      const buffer = Buffer.from(b64, "base64")
      const path = storagePath(session.user.id, "role-images", `costume-${Date.now()}.png`)
      url = await uploadToStorage("role-images", path, buffer, "image/png")
    } catch { /* keep base64 fallback */ }
  }

  return Response.json({ url })
}
