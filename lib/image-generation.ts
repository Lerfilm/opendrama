/**
 * Shared image generation functions — extracted from API routes.
 * Each function takes explicit parameters (no HTTP context, no auth, no charging)
 * and returns the generated URL + prompt.
 *
 * All functions accept an optional `styleAnchor` for cross-image visual consistency.
 */

import { aiComplete, aiGenerateImage, extractJSON } from "@/lib/ai"
import { uploadToStorage, isStorageConfigured, storagePath } from "@/lib/storage"
import { buildStorylineContext, StorylineEntry } from "@/lib/character-analysis"

// ── Helper ─────────────────────────────────────────────────────────────────
function styleDirective(anchor?: string): string {
  return anchor
    ? `- UNIFIED VISUAL STYLE (apply consistently): ${anchor}`
    : ""
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

// ── Character Portrait ─────────────────────────────────────────────────────
export async function generateCharacterPortrait(params: {
  userId: string
  name: string
  description: string
  role: string
  genre: string
  age?: string
  gender?: string
  height?: string
  ethnicity?: string
  physique?: string
  storylineJson?: string | null
  styleAnchor?: string
}): Promise<{ imageUrl: string; prompt: string }> {
  const { userId, name, description, role, genre, storylineJson, styleAnchor } = params
  const isLead = ["lead", "protagonist"].includes((role || "").toLowerCase())

  const specLines = [
    params.age ? `Age: ${params.age}` : "",
    params.gender ? `Gender: ${params.gender}` : "",
    params.height ? `Height: ${params.height}` : "",
    params.ethnicity ? `Ethnicity: ${params.ethnicity}` : "",
    params.physique ? `Physique: ${params.physique}` : "",
  ].filter(Boolean).join(", ")

  // Build scene context from pre-computed storyline
  let sceneContext = ""
  if (storylineJson) {
    try {
      const storyline: StorylineEntry[] = JSON.parse(storylineJson)
      sceneContext = buildStorylineContext(storyline.slice(0, 8), 800)
    } catch { /* ignore */ }
  }

  const ethnicityNote = params.ethnicity
    ? `Ethnicity: ${params.ethnicity} — reflect this accurately in facial features.`
    : `Ethnicity: not specified — match the character's description; do NOT default to any particular ethnicity.`

  const attractivenessNote = isLead
    ? `CRITICAL: This is a LEAD/PROTAGONIST character — they MUST have a CELEBRITY-LEVEL FACE. Think top-tier movie star: strikingly beautiful or handsome, perfect bone structure, captivating eyes, flawless complexion, the kind of face that commands the screen. This character must look like an A-list celebrity.`
    : `IMPORTANT: The character should be ATTRACTIVE and GOOD-LOOKING. Think professional actor/actress — beautiful or handsome, with clear skin, expressive eyes, and photogenic features. Even elderly characters should look distinguished, elegant, and charismatic.`

  const llmResult = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a casting director for short drama productions.
Generate a HIGHLY photorealistic character portrait prompt in English for AI image generation.

Requirements:
- 1:1 square portrait, head and shoulders or bust shot
- Ultra-realistic, 8K, RAW photo quality — NOT illustration, NOT anime, NOT painting
- Real human actor/actress appearance, pores and skin texture visible
- Natural face, professional film lighting, shallow depth of field
- Cinematic film still or professional headshot style
- ${attractivenessNote}
- Match the specified ethnicity/appearance exactly — do NOT default to any race if unspecified
- The character's expression and demeanor should reflect their personality from the scene context
${styleDirective(styleAnchor)}
- DO NOT include text, watermarks, or logos
- Output ONLY the image prompt, no explanation`,
      },
      {
        role: "user",
        content: `Character: ${name}
Role type: ${role || "supporting"}
Genre: ${genre || "drama"}
${ethnicityNote}
Physical specs: ${specLines || "not specified"}
Description: ${description || "no description"}

${sceneContext ? `--- SCENE APPEARANCES (use to understand character personality/expression) ---\n${sceneContext}\n---` : ""}

Generate a photorealistic portrait prompt:`,
      },
    ],
    maxTokens: 250,
  })

  const prompt = llmResult.content.trim()
  const b64DataUrl = await aiGenerateImage(prompt, "1:1")

  let imageUrl: string = b64DataUrl
  if (isStorageConfigured()) {
    try {
      const b64 = b64DataUrl.split(",")[1]
      const buffer = Buffer.from(b64, "base64")
      const path = storagePath(userId, "role-images", `${name}-portrait.png`)
      imageUrl = await uploadToStorage("role-images", path, buffer, "image/png")
    } catch (err) {
      console.warn("[generateCharacterPortrait] Storage upload failed, returning data URL:", err)
    }
  }

  return { imageUrl, prompt }
}

// ── Location Photo ─────────────────────────────────────────────────────────
export async function generateLocationPhoto(params: {
  userId: string
  locName: string
  type: string
  description?: string
  sceneDataJson?: string | null
  existingPrompt?: string
  styleAnchor?: string
}): Promise<{ url: string; prompt: string }> {
  const { userId, locName, type, description, sceneDataJson, existingPrompt, styleAnchor } = params

  let sceneContext = ""
  if (sceneDataJson) {
    try {
      const sceneData: Array<{ key: string; heading: string; mood: string; timeOfDay: string; actionSummary: string }> = JSON.parse(sceneDataJson)
      sceneContext = sceneData.slice(0, 5).map(s =>
        `${s.key}: ${s.heading} | Mood: ${s.mood} | Time: ${s.timeOfDay} | ${s.actionSummary}`
      ).join("\n")
    } catch { /* ignore */ }
  }

  const llmResult = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a location scout for short drama productions.
Generate a HIGHLY photorealistic location reference photo prompt for AI image generation.

Requirements:
- Wide-angle cinematic establishing shot (16:9 aspect ratio)
- Ultra-realistic, 8K quality — NOT illustration, NOT CGI
- Natural lighting appropriate for the time of day
- Show the location's character, atmosphere, and architectural details
- Must feel like a real place where filming would take place
- IMPORTANT: Read the scene content carefully — the location should match the mood, atmosphere, and activities described
${existingPrompt ? `- CONSISTENCY: A previous photo was generated with this prompt: "${existingPrompt}". Maintain the SAME architectural style, color palette, and spatial layout. Only vary the lighting/time of day if needed.` : ""}
${styleDirective(styleAnchor)}
- Output ONLY the image prompt, no explanation`,
      },
      {
        role: "user",
        content: `Location: ${locName}
Type: ${type === "EXT" ? "EXTERIOR (outdoor)" : type === "INT" ? "INTERIOR (indoor)" : "INT/EXT"}
Scout notes: ${description || "none"}

${sceneContext ? `--- SCENES AT THIS LOCATION (read for atmosphere/context) ---\n${sceneContext}\n---` : ""}

Generate a photorealistic location reference photo prompt:`,
      },
    ],
    maxTokens: 200,
  })

  const prompt = llmResult.content.trim()
  const b64DataUrl = await aiGenerateImage(prompt, "16:9")

  let url: string = b64DataUrl
  if (isStorageConfigured() && b64DataUrl.startsWith("data:")) {
    try {
      const b64 = b64DataUrl.split(",")[1]
      const buffer = Buffer.from(b64, "base64")
      const path = storagePath(userId, "scene-images", `loc-${locName}.png`)
      url = await uploadToStorage("scene-images", path, buffer, "image/png")
    } catch (err) {
      console.warn("[generateLocationPhoto] R2 upload failed, using base64 fallback:", err)
    }
  }

  return { url, prompt }
}

// ── Prop Photo ─────────────────────────────────────────────────────────────
export async function generatePropPhoto(params: {
  userId: string
  propName: string
  category: string
  description?: string
  sceneDataJson?: string | null
  styleAnchor?: string
}): Promise<{ url: string; prompt: string }> {
  const { userId, propName, category, description, sceneDataJson, styleAnchor } = params

  let sceneContext = ""
  if (sceneDataJson) {
    try {
      const sceneData: Array<{ key: string; heading: string; usage: string }> = JSON.parse(sceneDataJson)
      sceneContext = sceneData.slice(0, 4).map(s =>
        `${s.key}: ${s.heading} | Usage: ${s.usage}`
      ).join("\n")
    } catch { /* ignore */ }
  }

  const llmResult = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a props master for short drama productions.
Generate a photorealistic close-up reference photo prompt for a film prop.

Requirements:
- Professional close-up reference photo, sharp focus
- Studio lighting, clean neutral background
- Ultra-realistic, 4K detail — real photography, NOT CGI, NOT illustration
- Show the prop clearly with all important details visible
- IMPORTANT: Read the scene context to understand HOW the prop is used — this determines its style, condition, and appearance
- The prop should look production-ready for a film set
${styleDirective(styleAnchor)}
- Output ONLY the image prompt, no explanation`,
      },
      {
        role: "user",
        content: `Prop: ${propName}
Category: ${category || "general"}
Description: ${description || "no description"}

${sceneContext ? `--- SCENES WHERE THIS PROP APPEARS ---\n${sceneContext}\n---` : ""}

Generate a photorealistic prop reference photo prompt:`,
      },
    ],
    maxTokens: 200,
  })

  const prompt = llmResult.content.trim()
  const b64DataUrl = await aiGenerateImage(prompt, "1:1")

  let url: string = b64DataUrl
  if (isStorageConfigured() && b64DataUrl.startsWith("data:")) {
    try {
      const b64 = b64DataUrl.split(",")[1]
      const buffer = Buffer.from(b64, "base64")
      const path = storagePath(userId, "props-images", `prop-${propName}.png`)
      url = await uploadToStorage("props-images", path, buffer, "image/png")
    } catch (err) {
      console.warn("[generatePropPhoto] R2 upload failed, using base64 fallback:", err)
    }
  }

  return { url, prompt }
}

// ── Cover Image ────────────────────────────────────────────────────────────
export async function generateCoverForEpisode(params: {
  userId: string
  scriptId: string
  episodeNum: number
  title: string
  genre: string
  sceneSummary: string
  characterNames: string
  styleAnchor?: string
}): Promise<{ coverUrl: string; prompt: string }> {
  const { scriptId, episodeNum, title, genre, sceneSummary, characterNames, styleAnchor } = params

  const promptResult = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a cover art director for Chinese short-form vertical dramas.
Generate a vivid, cinematic image prompt in English for a 9:16 vertical poster.

Style requirements:
- Photorealistic, dramatic lighting (strong rim light, backlight, or neon glow)
- Focused on 1-2 characters: close-up or medium shot, intense emotional expression
- Cinematic composition for vertical/portrait orientation (9:16)
- High contrast, rich colors — bold shadows and highlights
- Atmosphere: tension, desire, betrayal, romance, or power struggle
- Real-life settings: office, luxury villa, street at night, hospital corridor, etc.
- Inspired by popular Chinese short drama aesthetics
${styleDirective(styleAnchor)}
- NO text, NO watermark, NO subtitles in the image
- Output: one compact English prompt, under 800 characters`,
      },
      {
        role: "user",
        content: `Title: ${title}
Genre: ${genre}
Episode ${episodeNum}
Characters: ${characterNames}
Scenes:
${sceneSummary}`,
      },
    ],
    temperature: 0.9,
    maxTokens: 1024,
  })

  const prompt = promptResult.content.trim()
  const b64DataUrl = await aiGenerateImage(prompt, "9:16")

  let coverUrl: string = b64DataUrl
  if (isStorageConfigured()) {
    try {
      const b64 = b64DataUrl.split(",")[1]
      const buffer = Buffer.from(b64, "base64")
      const path = `${scriptId}/cover-tall-ep${episodeNum}-${Date.now()}.png`
      coverUrl = await uploadToStorage("covers", path, buffer, "image/png")
    } catch (err) {
      console.warn("[generateCoverForEpisode] Storage upload failed:", err)
    }
  }

  return { coverUrl, prompt }
}

// ── Props Extraction ───────────────────────────────────────────────────────
export async function extractPropsFromScenes(params: {
  scenes: Array<{ episodeNum: number; sceneNum: number; heading: string | null; action: string }>
}): Promise<Array<{ name: string; category: string; description?: string; isKey?: boolean }>> {
  const sceneTexts = params.scenes.map(s => {
    let content = s.action || ""
    try {
      const blocks = JSON.parse(content) as Array<{ type: string; text?: string; character?: string; line?: string }>
      if (Array.isArray(blocks)) {
        content = blocks.map(b =>
          b.type === "action" ? (b.text || "") :
          b.type === "dialogue" ? `${b.character}: ${b.line}` : ""
        ).filter(Boolean).join("\n")
      }
    } catch { /* use raw */ }
    return `[E${s.episodeNum}S${s.sceneNum}] ${s.heading || ""}\n${content.slice(0, 300)}`
  }).join("\n\n")

  const result = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a professional props master for film/TV production.
Extract all physical props mentioned or implied in the screenplay scenes provided.

For each prop return:
- name: specific prop name (e.g. "Red leather handbag", "Vintage phone", "Coffee mug")
- category: one of "furniture" | "wardrobe" | "vehicle" | "food" | "weapon" | "electronic" | "document" | "other"
- description: brief visual description
- isKey: true if it's a significant story/character prop

Focus on SPECIFIC, IDENTIFIABLE props — not generic backgrounds.
Prioritize key props that define character or drive plot.

Return JSON: { "props": [...] }`,
      },
      { role: "user", content: `Extract props from these scenes:\n\n${sceneTexts}` },
    ],
    temperature: 0.3,
    maxTokens: 3000,
    responseFormat: "json",
  })

  const parsed = extractJSON<{ props: Array<{ name: string; category: string; description?: string; isKey?: boolean }> }>(result.content)
  return parsed.props || []
}

// ── Style Anchor Generation ────────────────────────────────────────────────
export async function generateStyleAnchor(params: {
  title: string
  genre: string
  characterSummary: string
  locationSummary: string
}): Promise<string> {
  const result = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a visual style director for film production.
Based on the script info below, define a UNIFIED VISUAL STYLE that will be applied
to ALL reference images (character portraits, location photos, prop photos, poster).

Output a concise style directive (max 120 words) covering:
- Color palette (warm/cool/neutral, dominant hues)
- Lighting style (natural/studio/dramatic/soft)
- Overall mood/atmosphere
- Photography style (cinematic/documentary/editorial)
- Era/period feel if relevant

This style must be consistent across portraits, locations, and props.
Output ONLY the style directive, no explanation.`,
      },
      {
        role: "user",
        content: `Title: ${params.title}
Genre: ${params.genre}
Characters: ${params.characterSummary}
Locations: ${params.locationSummary}`,
      },
    ],
    maxTokens: 200,
    temperature: 0.7,
  })

  return result.content.trim()
}
