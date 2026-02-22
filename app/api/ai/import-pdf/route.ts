export const dynamic = "force-dynamic"
export const maxDuration = 120 // 2 minutes for PDF processing
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete, extractJSON } from "@/lib/ai"

const PDF_IMPORT_SYSTEM_PROMPT = `You are a professional screenplay parser. You will receive raw text extracted from a screenplay PDF.
Your job is to parse it into a structured JSON format for a script management system.

Parse the screenplay into scenes. For each scene, extract:
- sceneNum: sequential scene number (1, 2, 3...)
- episodeNum: episode/act number (use 1 if not specified or it's a movie)
- heading: the scene heading / slug line (e.g. "INT. COFFEE SHOP - DAY")
- location: extracted location name from heading (e.g. "Coffee Shop")
- timeOfDay: time of day from heading (e.g. "DAY", "NIGHT", "MORNING")
- action: JSON array of blocks representing the scene content in order. Each block is one of:
  * { "type": "action", "text": "..." } for action/description lines
  * { "type": "dialogue", "character": "CHARACTER NAME", "parenthetical": "(quietly)", "line": "Dialogue text" } for dialogue
  * { "type": "direction", "text": "..." } for stage directions / transitions
- mood: inferred mood of the scene (e.g. "tense", "romantic", "comedic", "dramatic")
- promptHint: a brief visual description for AI video generation (1-2 sentences)
- duration: estimated scene duration in seconds (30-180)

Also extract:
- title: the screenplay title
- genre: detected genre
- roles: array of characters with { name, role: "lead"|"supporting"|"minor", description }

Return ONLY valid JSON with this structure:
{
  "title": "...",
  "genre": "...",
  "roles": [...],
  "scenes": [...]
}

Important:
- Preserve the actual dialogue and action text faithfully
- Group dialogue lines correctly with their character names
- Handle parentheticals within dialogue
- Scene numbers should restart per episode if multiple episodes are present
- If the text is Chinese, keep it in Chinese`

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { text, filename, genre, format, language, targetEpisodes } = await req.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    // Limit text size to avoid excessive token usage
    const truncatedText = text.slice(0, 30000)

    // Call AI to parse the screenplay
    const result = await aiComplete({
      messages: [
        { role: "system", content: PDF_IMPORT_SYSTEM_PROMPT },
        { role: "user", content: `Parse this screenplay:\n\n${truncatedText}` },
      ],
      temperature: 0.2,
      maxTokens: 12000,
      responseFormat: "json",
    })

    const parsed = extractJSON<{
      title?: string
      genre?: string
      roles?: Array<{ name: string; role: string; description?: string }>
      scenes?: Array<{
        sceneNum: number
        episodeNum?: number
        heading?: string
        location?: string
        timeOfDay?: string
        action?: unknown
        mood?: string
        promptHint?: string
        duration?: number
      }>
    }>(result.content)

    const title = parsed.title || filename?.replace(/\.pdf$/i, "") || "Imported Script"
    const detectedGenre = parsed.genre || genre || "drama"
    const roles = parsed.roles || []
    const scenes = parsed.scenes || []

    // Create the script
    const script = await prisma.script.create({
      data: {
        userId: session.user.id,
        title,
        genre: detectedGenre,
        format: format || "movie",
        language: language || "en",
        targetEpisodes: targetEpisodes || Math.max(...scenes.map(s => s.episodeNum || 1), 1),
        status: "draft",
      },
    })

    // Create roles
    if (roles.length > 0) {
      await prisma.scriptRole.createMany({
        data: roles.map(r => ({
          scriptId: script.id,
          name: r.name || "Unknown",
          role: ["lead", "supporting", "minor"].includes(r.role) ? r.role : "supporting",
          description: r.description || "",
        })),
      })
    }

    // Create scenes
    if (scenes.length > 0) {
      await prisma.scriptScene.createMany({
        data: scenes.map((s, i) => ({
          scriptId: script.id,
          episodeNum: s.episodeNum || 1,
          sceneNum: s.sceneNum || i + 1,
          sortOrder: i,
          heading: s.heading || "",
          location: s.location || "",
          timeOfDay: s.timeOfDay || "",
          action: Array.isArray(s.action) ? JSON.stringify(s.action) : (typeof s.action === "string" ? s.action : ""),
          mood: s.mood || "",
          promptHint: s.promptHint || "",
          duration: s.duration || 60,
        })),
      })
    }

    return NextResponse.json({
      scriptId: script.id,
      title,
      rolesCreated: roles.length,
      scenesCreated: scenes.length,
    })
  } catch (error) {
    console.error("PDF import error:", error)
    return NextResponse.json({ error: "Import failed" }, { status: 500 })
  }
}
