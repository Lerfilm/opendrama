export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes

import { NextRequest } from "next/server"
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
  const EP_MARKERS = [
    /^(?:EP|Episode|EPISODE)\s*(\d+)\b/m,
    /^第\s*([一二三四五六七八九十百\d]+)\s*集/m,
    /^第\s*(\d+)\s*集/m,
  ]

  const markers: Array<{ pos: number; epNum: number }> = []
  const lines = text.split("\n")
  let pos = 0
  for (const line of lines) {
    const trimmed = line.trim()
    for (const pattern of EP_MARKERS) {
      const m = trimmed.match(pattern)
      if (m) {
        const numStr = m[1]
        const epNum = parseInt(numStr) || chineseToNum(numStr)
        if (epNum > 0 && epNum <= 100) {
          markers.push({ pos, epNum })
          break
        }
      }
    }
    pos += line.length + 1
  }

  if (markers.length === 0) {
    return [{ episodeNum: 1, text }]
  }

  const seen = new Set<number>()
  const uniqueMarkers = markers.filter(m => {
    if (seen.has(m.epNum)) return false
    seen.add(m.epNum)
    return true
  })

  const chunks: Array<{ episodeNum: number; text: string }> = []
  for (let i = 0; i < uniqueMarkers.length; i++) {
    const start = uniqueMarkers[i].pos
    const end = i + 1 < uniqueMarkers.length ? uniqueMarkers[i + 1].pos : text.length
    const chunkText = text.slice(start, end).trim()
    if (chunkText.length > 100) {
      chunks.push({ episodeNum: uniqueMarkers[i].epNum, text: chunkText })
    }
  }

  if (uniqueMarkers[0].pos > 500) {
    chunks[0] = {
      ...chunks[0],
      text: text.slice(0, uniqueMarkers[0].pos) + "\n\n" + chunks[0].text,
    }
  }

  return chunks.length > 0 ? chunks : [{ episodeNum: 1, text }]
}

function chineseToNum(s: string): number {
  const map: Record<string, number> = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    "十一": 11, "十二": 12, "十三": 13, "十四": 14, "十五": 15,
    "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20,
  }
  return map[s] || 0
}

const MAX_CHUNK_CHARS = 40000

function splitChunkIfNeeded(chunk: { episodeNum: number; text: string }): Array<{ episodeNum: number; text: string; partIndex: number }> {
  if (chunk.text.length <= MAX_CHUNK_CHARS) {
    return [{ ...chunk, partIndex: 0 }]
  }

  const parts: Array<{ episodeNum: number; text: string; partIndex: number }> = []
  let remaining = chunk.text
  let partIndex = 0

  while (remaining.length > 0) {
    let slice = remaining.slice(0, MAX_CHUNK_CHARS)
    if (remaining.length > MAX_CHUNK_CHARS) {
      const breakPatterns = [
        /\n\s*\n(?=\s*(?:INT|EXT|I\/E|内景|外景)[\.\s])/g,
        /\n\s*\n(?=\s*场景\s*\d)/g,
      ]
      let bestBreak = -1
      for (const pat of breakPatterns) {
        pat.lastIndex = MAX_CHUNK_CHARS * 0.6
        const m = pat.exec(slice)
        if (m && m.index > bestBreak) bestBreak = m.index
      }
      if (bestBreak > 0) {
        slice = remaining.slice(0, bestBreak)
      } else {
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"))
        } catch {
          // controller may be closed
        }
      }

      function finish(data: object) {
        emit(data)
        try { controller.close() } catch { /* already closed */ }
      }

      try {
        // ── Parse request ────────────────────────────────────────────────────
        const contentType = req.headers.get("content-type") || ""
        let text: string
        let filename: string | undefined
        let genre: string | undefined
        let format: string | undefined
        let language: string | undefined
        let targetEpisodes: number | undefined
        let resumeScriptId: string | undefined

        if (contentType.includes("multipart/form-data")) {
          const formData = await req.formData()
          resumeScriptId = (formData.get("resumeScriptId") as string) || undefined

          const pdfFile = formData.get("pdf") as File | null
          if (!pdfFile) {
            return finish({ type: "error", error: "No PDF file provided" })
          }

          const MAX_BYTES = 15 * 1024 * 1024
          if (pdfFile.size > MAX_BYTES) {
            return finish({ type: "error", error: "PDF file exceeds 15 MB limit" })
          }

          filename = pdfFile.name
          genre = (formData.get("genre") as string) || undefined
          format = (formData.get("format") as string) || undefined
          language = (formData.get("language") as string) || undefined
          const te = formData.get("targetEpisodes")
          targetEpisodes = te ? parseInt(te as string, 10) : undefined

          emit({ type: "status", step: "Extracting text from PDF..." })

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
          resumeScriptId = body.resumeScriptId
        }

        if (!text?.trim()) {
          return finish({ type: "error", error: "No text could be extracted from PDF" })
        }

        // ── Split into chunks ────────────────────────────────────────────────
        const episodeChunks = splitIntoEpisodeChunks(text)
        const allParts = episodeChunks.flatMap(chunk => splitChunkIfNeeded(chunk))

        emit({ type: "total", total: allParts.length, episodes: episodeChunks.length })

        // ── Create or resume script ──────────────────────────────────────────
        let scriptId: string
        const existingEpisodes = new Set<number>()
        const epSceneCounters: Record<number, number> = {}
        let totalScenesCreated = 0

        if (resumeScriptId) {
          // Verify ownership
          const existing = await prisma.script.findFirst({
            where: { id: resumeScriptId, userId: session.user.id },
          })
          if (!existing) {
            return finish({ type: "error", error: "Script not found or access denied" })
          }
          scriptId = resumeScriptId

          // Find already-imported episodes
          const doneEpisodes = await prisma.scriptScene.findMany({
            where: { scriptId },
            select: { episodeNum: true },
            distinct: ["episodeNum"],
          })
          for (const { episodeNum } of doneEpisodes) {
            existingEpisodes.add(episodeNum)
          }

          // Get existing scene counters
          const counts = await prisma.scriptScene.groupBy({
            by: ["episodeNum"],
            where: { scriptId },
            _count: { _all: true },
          })
          for (const c of counts) {
            epSceneCounters[c.episodeNum] = c._count._all
            totalScenesCreated += c._count._all
          }

          emit({ type: "resume", scriptId, skipping: [...existingEpisodes], alreadyScenes: totalScenesCreated })

          // Set back to "importing" in case it was changed
          await prisma.script.update({
            where: { id: scriptId },
            data: { status: "importing" },
          })
        } else {
          // Charge for fresh import
          const charge = await chargeAiFeature(session.user.id, "import_pdf")
          if (!charge.ok) {
            return finish({
              type: "error",
              error: "insufficient_balance",
              balance: (charge as { balance?: number }).balance,
              required: (charge as { required?: number }).required,
            })
          }

          // Create script immediately so user has a scriptId even if we fail
          const script = await prisma.script.create({
            data: {
              userId: session.user.id,
              title: filename?.replace(/\.pdf$/i, "") || "Importing...",
              genre: genre || "drama",
              format: format || "series",
              language: language || "en",
              targetEpisodes: targetEpisodes || episodeChunks.length,
              status: "importing",
            },
          })
          scriptId = script.id
        }

        emit({ type: "script_created", scriptId })

        // ── Process chunks ───────────────────────────────────────────────────
        const allRoles: RoleParsed[] = []
        let globalTitle: string | undefined
        let globalGenre: string | undefined
        let titleExtracted = !!resumeScriptId
        let processedCount = 0

        for (let i = 0; i < allParts.length; i++) {
          const part = allParts[i]

          // Skip already-imported episodes on resume
          if (existingEpisodes.has(part.episodeNum)) {
            processedCount++
            emit({
              type: "skip",
              chunk: processedCount,
              total: allParts.length,
              episode: part.episodeNum,
            })
            continue
          }

          processedCount++
          const isFirstExtract = !titleExtracted

          emit({
            type: "progress",
            chunk: processedCount,
            total: allParts.length,
            episode: part.episodeNum,
            part: part.partIndex,
          })

          const startSceneNum = epSceneCounters[part.episodeNum] || 0

          const userMsg = isFirstExtract
            ? `Parse this screenplay completely and faithfully. Episode number: ${part.episodeNum}. Every scene, every line of dialogue, every action — copy it verbatim:\n\n${part.text}`
            : `Parse this screenplay section completely and faithfully. Episode number: ${part.episodeNum} (continuation, part ${part.partIndex + 1}). Scene numbering should continue from scene ${startSceneNum + 1}. Copy all content verbatim:\n\n${part.text}`

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
            emit({
              type: "chunk_error",
              chunk: processedCount,
              episode: part.episodeNum,
              error: String(err),
            })
            continue
          }

          // Extract title/genre from first successful chunk
          if (isFirstExtract) {
            globalTitle = chunkResult.title
            globalGenre = chunkResult.genre
            titleExtracted = true
          }

          // Collect roles (deduplicated)
          if (chunkResult.roles?.length) {
            for (const role of chunkResult.roles) {
              if (role.name && !allRoles.find(r => r.name.toLowerCase() === role.name.toLowerCase())) {
                allRoles.push(role)
              }
            }
          }

          // Save scenes immediately to DB
          if (chunkResult.scenes?.length) {
            const scenesToSave = chunkResult.scenes.map((scene, j) => ({
              scriptId,
              episodeNum: part.episodeNum,
              sceneNum: part.partIndex > 0 ? startSceneNum + j + 1 : (scene.sceneNum || j + 1),
              sortOrder: (part.episodeNum - 1) * 10000 + (part.partIndex > 0 ? startSceneNum + j + 1 : (scene.sceneNum || j + 1)),
              heading: scene.heading || "",
              location: scene.location || "",
              timeOfDay: scene.timeOfDay || "",
              action: Array.isArray(scene.action) ? JSON.stringify(scene.action) : (typeof scene.action === "string" ? scene.action : ""),
              mood: scene.mood || "",
              promptHint: scene.promptHint || "",
              duration: scene.duration || 60,
            }))

            await prisma.scriptScene.createMany({ data: scenesToSave })
            epSceneCounters[part.episodeNum] = startSceneNum + chunkResult.scenes.length
            totalScenesCreated += chunkResult.scenes.length

            emit({
              type: "chunk_done",
              chunk: processedCount,
              episode: part.episodeNum,
              scenes: chunkResult.scenes.length,
              totalScenes: totalScenesCreated,
            })
          }
        }

        // ── Save roles (new ones only) ───────────────────────────────────────
        let totalRolesCount = 0
        if (allRoles.length > 0) {
          const existingRoles = await prisma.scriptRole.findMany({
            where: { scriptId },
            select: { name: true },
          })
          const existingNames = new Set(existingRoles.map(r => r.name.toLowerCase()))
          const newRoles = allRoles.filter(r => !existingNames.has(r.name.toLowerCase()))

          if (newRoles.length > 0) {
            await prisma.scriptRole.createMany({
              data: newRoles.map(r => ({
                scriptId,
                name: r.name || "Unknown",
                role: ["lead", "supporting", "minor"].includes(r.role) ? r.role : "supporting",
                description: r.description || "",
              })),
            })
          }
          totalRolesCount = await prisma.scriptRole.count({ where: { scriptId } })
        }

        // ── Finalize script ──────────────────────────────────────────────────
        const finalTitle = globalTitle || filename?.replace(/\.pdf$/i, "") || "Imported Script"
        const finalGenre = globalGenre || genre || "drama"

        await prisma.script.update({
          where: { id: scriptId },
          data: {
            title: finalTitle,
            genre: finalGenre,
            status: "draft",
            targetEpisodes: targetEpisodes || episodeChunks.length,
          },
        })

        finish({
          type: "done",
          scriptId,
          title: finalTitle,
          scenes: totalScenesCreated,
          roles: totalRolesCount,
          episodes: episodeChunks.length,
        })
      } catch (error) {
        console.error("PDF import fatal error:", error)
        emit({ type: "error", error: "Import failed: " + String(error) })
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
