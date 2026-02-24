export type StorylineEntry = {
  key: string        // "E1S2"
  sceneId: string
  heading: string
  location: string
  timeOfDay: string
  mood: string
  lines: string[]    // character's dialogue lines (max 4)
  actions: string[]  // action sentences mentioning this character (max 2)
}

export type SceneInfo = {
  key: string
  sceneId: string
  heading: string
  location: string
  timeOfDay: string
  mood: string
}

export type ActionBlock = {
  type?: string
  character?: string
  line?: string
  text?: string
  [key: string]: unknown
}

/**
 * Parse scene action blocks and extract per-character data + plain text.
 * Returns characters with dialogue, their storyline entries, and plain action text.
 */
export function extractSceneData(
  blocks: ActionBlock[],
  sceneInfo: SceneInfo
): {
  characters: string[]
  storylineEntries: Record<string, StorylineEntry>  // UPPERCASE name → entry
  actionPlainText: string
} {
  const charLines: Record<string, string[]> = {}
  const actionTexts: string[] = []

  for (const block of blocks) {
    if (block.type === "dialogue" && block.character) {
      const name = block.character.trim().toUpperCase()
      if (!charLines[name]) charLines[name] = []
      if (block.line) charLines[name].push(block.line)
    }
    if (block.type === "action" && block.text) {
      actionTexts.push(block.text)
    }
  }

  const allActionText = actionTexts.join(" ")
  const entries: Record<string, StorylineEntry> = {}

  for (const name of Object.keys(charLines)) {
    const actionMentions = allActionText
      .split(/[.!?。！？]/)
      .filter(s => s.toUpperCase().includes(name))
      .slice(0, 2)
      .map(s => s.trim())
      .filter(Boolean)

    entries[name] = {
      ...sceneInfo,
      lines: charLines[name].slice(0, 4),
      actions: actionMentions,
    }
  }

  return {
    characters: Object.keys(charLines),
    storylineEntries: entries,
    actionPlainText: allActionText,
  }
}

/**
 * Build compact context string from storyline entries for AI prompts.
 * Trims at maxChars to avoid token overuse.
 */
export function buildStorylineContext(storyline: StorylineEntry[], maxChars = 1200): string {
  let ctx = ""
  for (const s of storyline) {
    const part = [
      `${s.key}: ${s.heading}`,
      s.lines.length ? `Dialogue: ${s.lines.map(l => `"${l}"`).join(" / ")}` : "",
      s.actions.length ? `Action: ${s.actions.join(". ")}` : "",
    ]
      .filter(Boolean)
      .join("\n")
    if ((ctx + part).length > maxChars) break
    ctx += part + "\n\n"
  }
  return ctx.trim()
}
