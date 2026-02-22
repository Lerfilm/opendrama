export const dynamic = "force-dynamic"
export const maxDuration = 120 // 2 minutes for PDF processing

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete, extractJSON } from "@/lib/ai"

const PDF_IMPORT_SYSTEM_PROMPT = `You are a professional screenplay parser. You will receive raw text extracted from a screenplay PDF.
Your ONLY job is to convert it into structured JSON — do NOT paraphrase, summarize, rewrite, or omit ANY content.

CRITICAL RULES:
1. COPY all dialogue VERBATIM — every single word, exactly as written
2. COPY all action/description text VERBATIM — every sentence, every detail
3. COPY all stage directions VERBATIM
4. Do NOT add, remove, or change any words in the actual script content
5. Do NOT skip any scenes, characters, props, or story elements
6. Preserve ALL props mentioned in action lines
7. Preserve ALL character names exactly as written (including case)
8. If content is in Chinese, keep it in Chinese exactly as written

Parse the screenplay into scenes. For each scene extract:
- sceneNum: sequential scene number (1, 2, 3...) — restart per episode
- episodeNum: episode number (use 1 for movies/single episodes)
- heading: the EXACT scene heading / slug line as written (e.g. "INT. COFFEE SHOP - DAY")
- location: location name extracted from heading
- timeOfDay: time of day from heading (e.g. "DAY", "NIGHT", "MORNING")
- action: JSON array of blocks in exact script order:
  * { "type": "action", "text": "EXACT action/description text" }
  * { "type": "dialogue", "character": "EXACT CHARACTER NAME", "parenthetical": "(exact parenthetical if any, else null)", "line": "EXACT dialogue text word for word" }
  * { "type": "direction", "text": "EXACT stage direction or transition" }
- mood: inferred mood (e.g. "tense", "romantic", "comedic", "dramatic", "suspenseful")
- promptHint: brief visual description for AI video generation (1-2 sentences, your own words)
- duration: estimated scene duration in seconds (30-180)

Also extract:
- title: the screenplay title
- genre: detected genre (drama/comedy/thriller/romance/scifi/fantasy/action)
- roles: ALL characters that appear, each with { name: "EXACT NAME", role: "lead"|"supporting"|"minor", description: "brief physical/personality description" }

Return ONLY valid JSON:
{
  "title": "...",
  "genre": "...",
  "roles": [...],
  "scenes": [...]
}

IMPORTANT: Include EVERY scene. Do not truncate or skip. The action array must contain the COMPLETE scene content.`

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const contentType = req.headers.get("content-type") || ""
    let text: string
    let filename: string | undefined
    let genre: string | undefined
    let format: string | undefined
    let language: string | undefined
    let targetEpisodes: number | undefined

    if (contentType.includes("multipart/form-data")) {
      // New path: receive raw PDF binary via FormData, extract text server-side
      const formData = await req.formData()
      const pdfFile = formData.get("pdf") as File | null
      if (!pdfFile) {
        return NextResponse.json({ error: "No PDF file provided" }, { status: 400 })
      }

      const MAX_BYTES = 15 * 1024 * 1024
      if (pdfFile.size > MAX_BYTES) {
        return NextResponse.json({ error: "PDF file exceeds 15 MB limit" }, { status: 400 })
      }

      filename = pdfFile.name
      genre = (formData.get("genre") as string) || undefined
      format = (formData.get("format") as string) || undefined
      language = (formData.get("language") as string) || undefined
      const te = formData.get("targetEpisodes")
      targetEpisodes = te ? parseInt(te as string, 10) : undefined

      // Parse PDF server-side using unpdf (edge-safe, no test file dependencies)
      const { extractText } = await import("unpdf")
      const arrayBuffer = await pdfFile.arrayBuffer()
      const { text: extractedText } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true })
      text = Array.isArray(extractedText) ? extractedText.join("\n") : (extractedText || "")
    } else {
      // Legacy JSON path (keep for backwards compatibility)
      const body = await req.json()
      text = body.text
      filename = body.filename
      genre = body.genre
      format = body.format
      language = body.language
      targetEpisodes = body.targetEpisodes
    }

    if (!text?.trim()) {
      return NextResponse.json({ error: "No text could be extracted from PDF" }, { status: 400 })
    }

    // Limit text size — 60k chars covers ~15,000 tokens of input
    // For longer scripts, we process as much as fits
    const MAX_CHARS = 60000
    const truncatedText = text.length > MAX_CHARS
      ? text.slice(0, MAX_CHARS)
      : text

    // Call AI to parse the screenplay
    const result = await aiComplete({
      messages: [
        { role: "system", content: PDF_IMPORT_SYSTEM_PROMPT },
        { role: "user", content: `Parse this screenplay completely and faithfully. Every scene, every line of dialogue, every action — copy it verbatim:\n\n${truncatedText}` },
      ],
      temperature: 0.1,
      maxTokens: 16000,
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
