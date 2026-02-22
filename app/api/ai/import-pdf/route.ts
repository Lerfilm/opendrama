export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes for chunked PDF processing

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete, extractJSON } from "@/lib/ai"
import { chargeAiFeature } from "@/lib/ai-pricing"

const PDF_IMPORT_SYSTEM_PROMPT = `You are a professional screenplay parser. You will receive raw text extracted from a screenplay PDF (one episode/section at a time).
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
- sceneNum: sequential scene number within this episode (1, 2, 3...)
- episodeNum: episode number provided in the user message
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

Also extract (only for the FIRST chunk / first call):
- title: the screenplay title (if visible in this section)
- genre: detected genre (drama/comedy/thriller/romance/scifi/fantasy/action)
- roles: ALL characters that appear in this section, each with { name: "EXACT NAME", role: "lead"|"supporting"|"minor", description: "brief physical/personality description" }

Return ONLY valid JSON:
{
  "title": "...",
  "genre": "...",
  "roles": [...],
  "scenes": [...]
}

IMPORTANT: Include EVERY scene from this section. Do not truncate or skip. The action array must contain the COMPLETE scene content.`

/** Split text into episode chunks by detecting EP1/EP2/第一集 etc. markers */
function splitIntoEpisodeChunks(text: string): Array<{ episodeNum: number; text: string }> {
  // Patterns that indicate start of an episode
  const EP_MARKERS = [
    /^(?:EP|Episode|EPISODE)\s*(\d+)\b/m,
    /^第\s*([一二三四五六七八九十百\d]+)\s*集/m,
    /^第\s*(\d+)\s*集/m,
  ]

  // Find all episode marker positions
  const markers: Array<{ pos: number; epNum: number }> = []

  // Try to find episode markers
  const lines = text.split("\n")
  let pos = 0
  for (const line of lines) {
    const trimmed = line.trim()
    for (const pattern of EP_MARKERS) {
      const m = trimmed.match(pattern)
      if (m) {
        const numStr = m[1]
        // Convert Chinese numerals if needed
        const epNum = parseInt(numStr) || chineseToNum(numStr)
        if (epNum > 0 && epNum <= 100) {
          markers.push({ pos, epNum })
          break
        }
      }
    }
    pos += line.length + 1
  }

  // If no episode markers found, treat entire text as episode 1
  if (markers.length === 0) {
    return [{ episodeNum: 1, text }]
  }

  // Deduplicate (keep first occurrence of each ep number)
  const seen = new Set<number>()
  const uniqueMarkers = markers.filter(m => {
    if (seen.has(m.epNum)) return false
    seen.add(m.epNum)
    return true
  })

  // Split text by markers
  const chunks: Array<{ episodeNum: number; text: string }> = []
  for (let i = 0; i < uniqueMarkers.length; i++) {
    const start = uniqueMarkers[i].pos
    const end = i + 1 < uniqueMarkers.length ? uniqueMarkers[i + 1].pos : text.length
    const chunkText = text.slice(start, end).trim()
    if (chunkText.length > 100) { // skip tiny chunks
      chunks.push({ episodeNum: uniqueMarkers[i].epNum, text: chunkText })
    }
  }

  // If text before first marker is substantial, add it as a preamble (ep 0 = metadata only, no scenes)
  if (uniqueMarkers[0].pos > 500) {
    // There's a meaningful preamble (title page etc.) — prepend to first chunk for title/genre/roles extraction
    chunks[0] = {
      ...chunks[0],
      text: text.slice(0, uniqueMarkers[0].pos) + "\n\n" + chunks[0].text,
    }
  }

  return chunks.length > 0 ? chunks : [{ episodeNum: 1, text }]
}

/** Convert simple Chinese numerals to integer */
function chineseToNum(s: string): number {
  const map: Record<string, number> = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    "十一": 11, "十二": 12, "十三": 13, "十四": 14, "十五": 15,
    "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20,
  }
  return map[s] || 0
}

const MAX_CHUNK_CHARS = 40000 // safe input size per AI call (~10k tokens)

/** Further split a chunk if it's too large */
function splitChunkIfNeeded(chunk: { episodeNum: number; text: string }): Array<{ episodeNum: number; text: string; partIndex: number }> {
  if (chunk.text.length <= MAX_CHUNK_CHARS) {
    return [{ ...chunk, partIndex: 0 }]
  }

  const parts: Array<{ episodeNum: number; text: string; partIndex: number }> = []
  let remaining = chunk.text
  let partIndex = 0

  while (remaining.length > 0) {
    let slice = remaining.slice(0, MAX_CHUNK_CHARS)
    // Try to cut at a scene heading boundary (blank line + INT./EXT.)
    if (remaining.length > MAX_CHUNK_CHARS) {
      // Look for a scene break near the end of the slice
      const breakPatterns = [
        /\n\s*\n(?=\s*(?:INT|EXT|I\/E|内景|外景)[\.\s])/g,
        /\n\s*\n(?=\s*场景\s*\d)/g,
      ]
      let bestBreak = -1
      for (const pat of breakPatterns) {
        pat.lastIndex = MAX_CHUNK_CHARS * 0.6 // start looking at 60% of chunk
        const m = pat.exec(slice)
        if (m && m.index > bestBreak) bestBreak = m.index
      }
      if (bestBreak > 0) {
        slice = remaining.slice(0, bestBreak)
      } else {
        // Fall back to paragraph boundary
        const lastPara = slice.lastIndexOf("\n\n")
        if (lastPara > MAX_CHUNK_CHARS * 0.5) {
          slice = remaining.slice(0, lastPara)
        }
      }
    }

    parts.push({ episodeNum: chunk.episodeNum, text: slice, partIndex })
    remaining = remaining.slice(slice.length).trim()
    partIndex++
  }

  return parts
}

type SceneParsed = {
  sceneNum: number
  episodeNum?: number
  heading?: string
  location?: string
  timeOfDay?: string
  action?: unknown
  mood?: string
  promptHint?: string
  duration?: number
}

type RoleParsed = {
  name: string
  role: string
  description?: string
}

type ChunkResult = {
  title?: string
  genre?: string
  roles?: RoleParsed[]
  scenes?: SceneParsed[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const charge = await chargeAiFeature(session.user.id, "import_pdf")
  if (!charge.ok) {
    return NextResponse.json({ error: "insufficient_balance", balance: charge.balance, required: charge.required }, { status: 402 })
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

      const { extractText } = await import("unpdf")
      const arrayBuffer = await pdfFile.arrayBuffer()
      const { text: extractedText } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true })
      text = Array.isArray(extractedText) ? extractedText.join("\n") : (extractedText || "")
    } else {
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

    // Split by episode, then further split large episodes
    const episodeChunks = splitIntoEpisodeChunks(text)
    const allParts = episodeChunks.flatMap(chunk => splitChunkIfNeeded(chunk))

    // Process each part with AI
    let globalTitle: string | undefined
    let globalGenre: string | undefined
    const allRoles: RoleParsed[] = []
    const allScenes: SceneParsed[] = []

    // Track scene numbers per episode for multi-part episodes
    const epSceneCounters: Record<number, number> = {}

    for (let i = 0; i < allParts.length; i++) {
      const part = allParts[i]
      const isFirstPart = i === 0

      const userMsg = isFirstPart
        ? `Parse this screenplay completely and faithfully. Episode number: ${part.episodeNum}. Every scene, every line of dialogue, every action — copy it verbatim:\n\n${part.text}`
        : `Parse this screenplay section completely and faithfully. Episode number: ${part.episodeNum} (continuation, part ${part.partIndex + 1}). Scene numbering should continue from scene ${(epSceneCounters[part.episodeNum] || 0) + 1}. Copy all content verbatim:\n\n${part.text}`

      let chunkResult: ChunkResult = {}
      try {
        const result = await aiComplete({
          messages: [
            { role: "system", content: PDF_IMPORT_SYSTEM_PROMPT },
            { role: "user", content: userMsg },
          ],
          temperature: 0.1,
          maxTokens: 32000,
          responseFormat: "json",
        })
        chunkResult = extractJSON<ChunkResult>(result.content) || {}
      } catch (err) {
        console.error(`PDF import: chunk ${i} (ep${part.episodeNum}) failed:`, err)
        // Continue with other chunks
        continue
      }

      // Collect title/genre from first chunk only
      if (isFirstPart) {
        globalTitle = chunkResult.title
        globalGenre = chunkResult.genre
      }

      // Collect roles (deduplicate by name)
      if (chunkResult.roles?.length) {
        for (const role of chunkResult.roles) {
          if (role.name && !allRoles.find(r => r.name.toLowerCase() === role.name.toLowerCase())) {
            allRoles.push(role)
          }
        }
      }

      // Collect scenes, fix episode numbers
      if (chunkResult.scenes?.length) {
        const startSceneNum = epSceneCounters[part.episodeNum] || 0
        for (let j = 0; j < chunkResult.scenes.length; j++) {
          const scene = chunkResult.scenes[j]
          scene.episodeNum = part.episodeNum
          // Re-number scenes if continuation part to avoid duplicates
          if (part.partIndex > 0) {
            scene.sceneNum = startSceneNum + j + 1
          }
          allScenes.push(scene)
        }
        epSceneCounters[part.episodeNum] = (epSceneCounters[part.episodeNum] || 0) + chunkResult.scenes.length
      }
    }

    const title = globalTitle || filename?.replace(/\.pdf$/i, "") || "Imported Script"
    const detectedGenre = globalGenre || genre || "drama"

    // Determine max episode number
    const maxEp = allScenes.length > 0
      ? Math.max(...allScenes.map(s => s.episodeNum || 1))
      : 1

    // Create the script
    const script = await prisma.script.create({
      data: {
        userId: session.user.id,
        title,
        genre: detectedGenre,
        format: format || "series",
        language: language || "en",
        targetEpisodes: targetEpisodes || maxEp,
        status: "draft",
      },
    })

    // Create roles
    if (allRoles.length > 0) {
      await prisma.scriptRole.createMany({
        data: allRoles.map(r => ({
          scriptId: script.id,
          name: r.name || "Unknown",
          role: ["lead", "supporting", "minor"].includes(r.role) ? r.role : "supporting",
          description: r.description || "",
        })),
      })
    }

    // Create scenes
    if (allScenes.length > 0) {
      // Sort by episodeNum then sceneNum
      allScenes.sort((a, b) => {
        const epDiff = (a.episodeNum || 1) - (b.episodeNum || 1)
        if (epDiff !== 0) return epDiff
        return (a.sceneNum || 0) - (b.sceneNum || 0)
      })

      await prisma.scriptScene.createMany({
        data: allScenes.map((s, i) => ({
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
      rolesCreated: allRoles.length,
      scenesCreated: allScenes.length,
      episodesProcessed: episodeChunks.length,
      chunksProcessed: allParts.length,
    })
  } catch (error) {
    console.error("PDF import error:", error)
    return NextResponse.json({ error: "Import failed" }, { status: 500 })
  }
}
