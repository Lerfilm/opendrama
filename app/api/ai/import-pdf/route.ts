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

      // Parse PDF server-side using pdf-parse (dynamic import avoids Next.js build issues)
      const pdfModule = await import("pdf-parse")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = (pdfModule as any).default ?? pdfModule
      const arrayBuffer = await pdfFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const parsedPdf = await pdfParse(buffer)
      text = parsedPdf.text || ""
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
