export const dynamic = "force-dynamic"
export const maxDuration = 60
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { aiComplete } from "@/lib/ai"
import prisma from "@/lib/prisma"
import { chargeAiFeatureSilent } from "@/lib/ai-pricing"
import { buildStorylineContext, StorylineEntry } from "@/lib/character-analysis"

// ── Valid dropdown values (must match casting-workspace.tsx) ──────────────────
const VALID_GENDER = ["Female", "Male", "Non-binary", "Any"]
const VALID_PHYSIQUE = ["Slim", "Athletic", "Average", "Curvy", "Muscular", "Heavy-set"]
const VALID_ETHNICITY = ["Asian", "East Asian", "South Asian", "Southeast Asian", "Caucasian", "Black/African", "Latino/Hispanic", "Middle Eastern", "Mixed", "Other"]

/** Fuzzy-match a value to the closest option in a list (case-insensitive) */
function normalize(value: string | undefined | null, options: string[]): string {
  if (!value) return ""
  const v = value.trim()
  if (!v) return ""
  // Exact match (case-insensitive)
  const exact = options.find(o => o.toLowerCase() === v.toLowerCase())
  if (exact) return exact
  // Partial / alias match
  const lower = v.toLowerCase()
  const aliases: Record<string, string> = {
    // Gender
    "female": "Female", "f": "Female", "woman": "Female", "girl": "Female",
    "male": "Male", "m": "Male", "man": "Male", "boy": "Male",
    "non-binary": "Non-binary", "nonbinary": "Non-binary", "nb": "Non-binary",
    // Physique
    "slim": "Slim", "thin": "Slim", "slender": "Slim", "petite": "Slim",
    "athletic": "Athletic", "fit": "Athletic", "toned": "Athletic", "sporty": "Athletic",
    "average": "Average", "medium": "Average", "normal": "Average",
    "curvy": "Curvy", "voluptuous": "Curvy", "full-figured": "Curvy",
    "muscular": "Muscular", "buff": "Muscular", "strong": "Muscular", "built": "Muscular",
    "heavy-set": "Heavy-set", "heavyset": "Heavy-set", "large": "Heavy-set", "overweight": "Heavy-set",
    // Ethnicity
    "asian": "Asian", "east asian": "East Asian", "chinese": "East Asian", "japanese": "East Asian", "korean": "East Asian",
    "south asian": "South Asian", "indian": "South Asian", "pakistani": "South Asian",
    "southeast asian": "Southeast Asian", "thai": "Southeast Asian", "vietnamese": "Southeast Asian", "filipino": "Southeast Asian",
    "caucasian": "Caucasian", "white": "Caucasian", "european": "Caucasian",
    "black": "Black/African", "african": "Black/African", "african american": "Black/African", "black/african": "Black/African",
    "hispanic": "Latino/Hispanic", "latino": "Latino/Hispanic", "latina": "Latino/Hispanic", "latin": "Latino/Hispanic", "latino/hispanic": "Latino/Hispanic",
    "middle eastern": "Middle Eastern", "arab": "Middle Eastern", "persian": "Middle Eastern",
    "mixed": "Mixed", "multiracial": "Mixed", "biracial": "Mixed",
  }
  if (aliases[lower]) return aliases[lower]
  // Contains-based match
  const contains = options.find(o => lower.includes(o.toLowerCase()) || o.toLowerCase().includes(lower))
  if (contains) return contains
  return ""
}

/**
 * POST /api/ai/fill-character-specs
 * Parse Character Description + scene dialogue and extract casting specs.
 * Body: { name, description, role, scriptId }
 * Returns: { age, gender, height, ethnicity, nationality, physique }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  chargeAiFeatureSilent(session.user.id, "fill_character_specs")

  const { name, description, role, scriptId } = await req.json()
  if (!description) return Response.json({}, { status: 200 })

  // Fetch character context from pre-computed storyline (fast path)
  let dialogueContext = ""
  if (scriptId && name) {
    try {
      const roleRecord = await prisma.scriptRole.findFirst({
        where: { scriptId, name: { equals: name, mode: "insensitive" } },
        select: { storyline: true },
      })
      if (roleRecord?.storyline) {
        const storyline: StorylineEntry[] = JSON.parse(roleRecord.storyline)
        dialogueContext = buildStorylineContext(storyline, 1200)
        console.log("[fill-character-specs] using storyline context, entries:", storyline.length)
      }
    } catch { /* ignore, fallback below */ }

    // Fallback: legacy 50-scene scan for scripts imported before this optimization
    if (!dialogueContext) {
      try {
        const scenes = await prisma.scriptScene.findMany({
          where: { scriptId },
          select: { episodeNum: true, sceneNum: true, heading: true, action: true },
          orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
          take: 50,
        })
        const charNameUpper = name.trim().toUpperCase()
        const relevantScenes: string[] = []
        for (const scene of scenes) {
          const sceneParts: string[] = [`E${scene.episodeNum}S${scene.sceneNum}: ${scene.heading || ""}`]
          if (scene.action) {
            const raw = scene.action.trim()
            let actionText = raw
            if (raw.startsWith("[")) {
              try { const blocks: { text?: string; line?: string }[] = JSON.parse(raw); actionText = blocks.map(b => b.text || b.line || "").filter(Boolean).join(" ") } catch { /* keep raw */ }
            }
            if (actionText.toUpperCase().includes(charNameUpper)) {
              const sentences = actionText.split(/[.!?。！？]/).filter(s => s.toUpperCase().includes(charNameUpper))
              if (sentences.length > 0) sceneParts.push(`Action: ${sentences.slice(0, 3).join(". ").substring(0, 300)}`)
              relevantScenes.push(sceneParts.join("\n"))
            }
          }
        }
        if (relevantScenes.length > 0) {
          let ctx = ""
          for (const s of relevantScenes) { if ((ctx + s).length > 1200) break; ctx += s + "\n\n" }
          dialogueContext = ctx.trim()
        }
      } catch { /* ignore */ }
    }
  }

  const result = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a casting director assistant. Your job is to carefully read the character description AND their scene appearances (dialogue, action, stage direction) to extract casting specs as JSON.

IMPORTANT RULES:
- Read the description AND scene context CAREFULLY. Extract what is stated or strongly implied.
- Scene dialogue and actions reveal character details: age from how others address them, gender from pronouns (she/her = Female, he/him = Male), physical traits from descriptions.
- If the description says "26 years old", age must be "26", NOT "25-35".
- If the description says "female lead" or uses "her/she", gender must be "Female".
- If the description says "male lead" or uses "his/he", gender must be "Male".
- If the description says "six-year-old son", age must be "6" and gender must be "Male".
- Do NOT invent or hallucinate data. If something is not mentioned, use empty string "".
- Nationality default is "English" if not mentioned.

Return ONLY a JSON object with exactly these fields:
{
  "age": "<exact age or range from description, e.g. '26' or '30-40'. Empty string if not mentioned>",
  "gender": "<Female|Male|Non-binary|Any or empty string>",
  "height": "<e.g. '168cm'. Empty string if not mentioned>",
  "ethnicity": "<East Asian|Caucasian|Black/African|Latino/Hispanic|South Asian|Southeast Asian|Middle Eastern|Mixed|Asian|Other or empty string. ONLY if explicitly stated>",
  "nationality": "<nationality. Default to 'English' if not mentioned>",
  "physique": "<Slim|Athletic|Average|Curvy|Muscular|Heavy-set or empty string>"
}`,
      },
      {
        role: "user",
        content: `Character: ${name} (${role || "supporting"})
Description: ${description}

${dialogueContext ? `--- SCENE APPEARANCES (read for additional character clues) ---\n${dialogueContext}\n---` : ""}

Extract casting specs as JSON:`,
      },
    ],
    maxTokens: 200,
  })

  try {
    const raw = result.content.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "")
    const specs = JSON.parse(raw)

    // Normalize dropdown values to match exact option strings
    const normalized = {
      age: (specs.age || "").toString().trim(),
      gender: normalize(specs.gender, VALID_GENDER),
      height: (specs.height || "").toString().trim(),
      ethnicity: normalize(specs.ethnicity, VALID_ETHNICITY),
      nationality: (specs.nationality || "English").toString().trim(),
      physique: normalize(specs.physique, VALID_PHYSIQUE),
    }

    // Persist castingSpecs to DB so downstream routes can read it
    if (scriptId && name) {
      prisma.scriptRole.updateMany({
        where: { scriptId, name: { equals: name, mode: "insensitive" } },
        data: { castingSpecs: JSON.stringify(normalized) },
      }).catch(err => console.warn("[fill-character-specs] castingSpecs save failed:", err))
    }

    return Response.json(normalized)
  } catch {
    return Response.json({})
  }
}
