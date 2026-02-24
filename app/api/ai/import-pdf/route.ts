export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes

import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { createFreshPrismaClient } from "@/lib/prisma"
import { aiComplete, extractJSON } from "@/lib/ai"
import { chargeAiFeature, chargeAiFeatureSilent } from "@/lib/ai-pricing"
import { uploadToStorage, isStorageConfigured } from "@/lib/storage"
import { extractSceneData, StorylineEntry } from "@/lib/character-analysis"
import {
  generateCharacterPortrait,
  generateLocationPhoto,
  generatePropPhoto,
  generateCoverForEpisode,
  extractPropsFromScenes,
  generateStyleAnchor,
} from "@/lib/image-generation"
import prisma from "@/lib/prisma"

// ── Concurrency control ────────────────────────────────────────────────────
// In-memory semaphore for global import concurrency (per process / machine).
// For multi-machine deployments, the DB-level check (script.status = "importing")
// provides an additional safety layer.
const MAX_CONCURRENT_IMPORTS = 3
let activeImports = 0

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

/** Split text into episode chunks by detecting EP1/EP2/第一集 etc. markers.
 *  Falls back to even split by targetEpisodes if no markers found. */
function splitIntoEpisodeChunks(
  text: string,
  targetEpisodes = 1,
): Array<{ episodeNum: number; text: string }> {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  // Patterns anchored to START of trimmed line — checked for lines of any length
  const START_PATTERNS: Array<[RegExp, "num" | "cn"]> = [
    [/^EP\.?\s*0*(\d+)\b/i, "num"],                              // EP1, EP.1, EP 1
    [/^E0*(\d+)\b/i, "num"],                                     // E01, E1
    [/^Episode\.?\s*0*(\d+)\b/i, "num"],                        // Episode 1
    [/^第\s*0*(\d+)\s*集/, "num"],                               // 第1集, 第01集
    [/^第\s*([一二三四五六七八九十百千万]+)\s*集/, "cn"],          // 第一集, 第二十集
    [/^【第\s*0*(\d+)\s*集】/, "num"],                            // 【第1集】
    [/^【第\s*([一二三四五六七八九十百千万]+)\s*集】/, "cn"],       // 【第一集】
    [/^（第\s*0*(\d+)\s*集）/, "num"],                            // （第1集）
    [/^（第\s*([一二三四五六七八九十百千万]+)\s*集）/, "cn"],      // （第一集）
  ]

  // Patterns checked anywhere in the line — only for short lines (≤40 chars)
  const ANYWHERE_PATTERNS: Array<[RegExp, "num" | "cn"]> = [
    [/\bEP\.?\s*0*(\d+)\b/i, "num"],
    [/第\s*0*(\d+)\s*集/, "num"],
    [/第\s*([一二三四五六七八九十百千万]+)\s*集/, "cn"],
  ]

  const markers: Array<{ pos: number; epNum: number }> = []
  const lines = normalized.split("\n")
  let pos = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) {
      let matched = false
      // Check start-of-line patterns (no length restriction)
      for (const [pat, type] of START_PATTERNS) {
        const m = trimmed.match(pat)
        if (m) {
          const epNum = type === "cn" ? chineseToNum(m[1]) : parseInt(m[1], 10)
          if (epNum > 0 && epNum <= 200) {
            markers.push({ pos, epNum })
            matched = true
            break
          }
        }
      }
      // Check anywhere patterns only for short lines
      if (!matched && trimmed.length <= 40) {
        for (const [pat, type] of ANYWHERE_PATTERNS) {
          const m = trimmed.match(pat)
          if (m) {
            const epNum = type === "cn" ? chineseToNum(m[1]) : parseInt(m[1], 10)
            if (epNum > 0 && epNum <= 200) {
              markers.push({ pos, epNum })
              break
            }
          }
        }
      }
    }
    pos += line.length + 1
  }

  // Deduplicate: keep first occurrence of each episode number
  const seen = new Set<number>()
  const uniqueMarkers = markers.filter(m => {
    if (seen.has(m.epNum)) return false
    seen.add(m.epNum)
    return true
  })

  if (uniqueMarkers.length > 1) {
    // Build chunks from detected markers
    const chunks: Array<{ episodeNum: number; text: string }> = []
    for (let i = 0; i < uniqueMarkers.length; i++) {
      const start = uniqueMarkers[i].pos
      const end = i + 1 < uniqueMarkers.length ? uniqueMarkers[i + 1].pos : normalized.length
      const chunkText = normalized.slice(start, end).trim()
      if (chunkText.length > 50) {
        chunks.push({ episodeNum: uniqueMarkers[i].epNum, text: chunkText })
      }
    }
    if (uniqueMarkers[0].pos > 500) {
      chunks[0] = {
        ...chunks[0],
        text: normalized.slice(0, uniqueMarkers[0].pos) + "\n\n" + chunks[0].text,
      }
    }
    if (chunks.length > 0) return chunks
  }

  // Fallback: no markers found — split evenly by targetEpisodes
  if (targetEpisodes > 1) {
    return splitEvenlyByEpisodes(normalized, targetEpisodes)
  }

  return [{ episodeNum: 1, text: normalized }]
}

/** Evenly split text into N episode chunks, breaking at paragraph boundaries */
function splitEvenlyByEpisodes(text: string, count: number): Array<{ episodeNum: number; text: string }> {
  const targetLen = Math.ceil(text.length / count)
  const chunks: Array<{ episodeNum: number; text: string }> = []
  let remaining = text
  let epNum = 1

  while (remaining.length > 0 && epNum <= count) {
    if (epNum === count) {
      if (remaining.trim().length > 50) chunks.push({ episodeNum: epNum, text: remaining.trim() })
      break
    }
    let slice = remaining.slice(0, targetLen)
    // Try to break at a blank line near the target length
    const lastPara = slice.lastIndexOf("\n\n")
    if (lastPara > targetLen * 0.55) {
      slice = remaining.slice(0, lastPara)
    }
    if (slice.trim().length > 50) {
      chunks.push({ episodeNum: epNum, text: slice.trim() })
    }
    remaining = remaining.slice(slice.length).trimStart()
    epNum++
  }

  return chunks.length > 0 ? chunks : [{ episodeNum: 1, text }]
}

function chineseToNum(s: string): number {
  const UNIT: Record<string, number> = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 }
  const TENS: Record<string, number> = { "十": 10, "百": 100, "千": 1000, "万": 10000 }
  let result = 0
  let current = 0
  for (const ch of s) {
    if (UNIT[ch] !== undefined) {
      current = UNIT[ch]
    } else if (TENS[ch] !== undefined) {
      if (current === 0) current = 1  // handle 十一 = 11 (leading 十 without preceding 一)
      result += current * TENS[ch]
      current = 0
    }
  }
  result += current
  return result || 0
}

/**
 * Try to extract the screenplay title from the first lines of raw PDF text.
 * Screenplays typically have the title as an ALL-CAPS line near the top of page 1.
 */
function extractTitleFromRawText(text: string): string | null {
  const lines = text.split("\n").slice(0, 60)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.length < 4 || line.length > 100) continue
    // Skip obvious non-title lines
    if (/^\d+$/.test(line)) continue                              // bare page number
    if (/^(page|pg\.?)\s+\d+/i.test(line)) continue
    if (/^(written\s+by|author:|copyright|draft|rev[ision]*|version|v\d+)/i.test(line)) continue
    if (/^ep\.?\s*\d+|^episode\s+\d+|^第.*集/i.test(line)) continue
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(line)) continue  // date
    if (/^(int\.|ext\.|int\/ext)/i.test(line)) continue           // scene heading
    // ALL CAPS line with at least one letter — strong title candidate
    if (line === line.toUpperCase() && /[A-Z]/.test(line)) {
      // Strip trailing punctuation for cleanliness but keep ! and ?
      return line.replace(/[.,;:]+$/, "").trim()
    }
  }
  return null
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

  // ── Per-user lock: prevent same user from running multiple imports ──────
  // Auto-release stuck imports older than 10 minutes (crash / timeout recovery)
  const STALE_IMPORT_MS = 10 * 60 * 1000
  const staleThreshold = new Date(Date.now() - STALE_IMPORT_MS)

  await prisma.script.updateMany({
    where: {
      userId: session.user.id,
      status: { in: ["importing", "generating"] },
      updatedAt: { lt: staleThreshold },
    },
    data: { status: "draft" },
  })

  const userImporting = await prisma.script.findFirst({
    where: { userId: session.user.id, status: { in: ["importing", "generating"] } },
    select: { id: true, updatedAt: true },
  })
  if (userImporting) {
    return new Response(
      JSON.stringify({ error: "import_in_progress", message: "You already have an import in progress. Please wait for it to finish." }),
      { status: 429 },
    )
  }

  // ── Global concurrency gate ────────────────────────────────────────────
  if (activeImports >= MAX_CONCURRENT_IMPORTS) {
    return new Response(
      JSON.stringify({ error: "server_busy", message: "Too many imports running. Please try again in a minute." }),
      { status: 503 },
    )
  }
  activeImports++

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false

      function emit(data: object) {
        if (streamClosed) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"))
        } catch {
          streamClosed = true
        }
      }

      function finish(data: object) {
        clearInterval(heartbeat)
        clearInterval(dbTouch)
        emit(data)
        streamClosed = true
        try { controller.close() } catch { /* already closed */ }
      }

      // Keep-alive: send heartbeat every 15s to prevent Fly.io/Cloudflare idle timeout
      const heartbeat = setInterval(() => {
        emit({ type: "heartbeat" })
      }, 15_000)

      // Touch script.updatedAt every 2 min to prevent stale-import auto-release
      let scriptIdForTouch: string | undefined
      const dbTouch = setInterval(() => {
        if (scriptIdForTouch) {
          prisma.script.update({
            where: { id: scriptIdForTouch },
            data: { updatedAt: new Date() },
          }).catch(() => {})
        }
      }, 2 * 60 * 1000)

      // Use a fresh Prisma client for this long-running import
      // to avoid DbHandler exit from idle connection timeouts
      const db = createFreshPrismaClient()

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
        let pdfFileRef: File | null = null
        let genImages = { characters: true, locations: true, props: true, cover: true }

        if (contentType.includes("multipart/form-data")) {
          const formData = await req.formData()
          resumeScriptId = (formData.get("resumeScriptId") as string) || undefined

          const pdfFile = formData.get("pdf") as File | null
          pdfFileRef = pdfFile
          if (!pdfFile) {
            return finish({ type: "error", error: "No PDF file provided" })
          }

          const MAX_BYTES = 1 * 1024 * 1024
          if (pdfFile.size > MAX_BYTES) {
            return finish({ type: "error", error: "PDF file exceeds 1 MB limit" })
          }

          filename = pdfFile.name
          genre = (formData.get("genre") as string) || undefined
          format = (formData.get("format") as string) || undefined
          language = (formData.get("language") as string) || undefined
          const te = formData.get("targetEpisodes")
          targetEpisodes = te ? parseInt(te as string, 10) : undefined
          const gi = formData.get("genImages") as string
          if (gi) { try { genImages = JSON.parse(gi) } catch { /* keep defaults */ } }

          emit({ type: "status", step: "Extracting text from PDF..." })

          const { extractText } = await import("unpdf")
          const arrayBuffer = await pdfFile.arrayBuffer()
          // NOTE: mergePages: true collapses all whitespace to spaces (destroys newlines).
          // Use mergePages: false to get per-page text arrays, then join with \n\n
          // so that EP markers at the start of each page remain on their own lines.
          const { text: extractedText, totalPages } = await extractText(new Uint8Array(arrayBuffer), { mergePages: false })
          console.log(`PDF extracted: ${totalPages} pages`)
          text = Array.isArray(extractedText) ? extractedText.join("\n\n") : (extractedText as string || "")
          console.log(`PDF text length: ${text.length}, first 200 chars:`, JSON.stringify(text.slice(0, 200)))
        } else {
          const body = await req.json()
          text = body.text
          filename = body.filename
          genre = body.genre
          format = body.format
          language = body.language
          targetEpisodes = body.targetEpisodes
          resumeScriptId = body.resumeScriptId
          if (body.genImages) genImages = body.genImages
        }

        if (!text?.trim()) {
          return finish({ type: "error", error: "No text could be extracted from PDF" })
        }

        // ── Split into chunks ────────────────────────────────────────────────
        const episodeChunks = splitIntoEpisodeChunks(text, targetEpisodes)
        const allParts = episodeChunks.flatMap(chunk => splitChunkIfNeeded(chunk))

        emit({ type: "total", total: allParts.length, episodes: episodeChunks.length })

        // ── Create or resume script ──────────────────────────────────────────
        let scriptId: string
        const existingEpisodes = new Set<number>()
        const epSceneCounters: Record<number, number> = {}
        let totalScenesCreated = 0

        if (resumeScriptId) {
          // Verify ownership
          const existing = await db.script.findFirst({
            where: { id: resumeScriptId, userId: session.user.id },
          })
          if (!existing) {
            return finish({ type: "error", error: "Script not found or access denied" })
          }
          scriptId = resumeScriptId

          // Find already-imported episodes
          const doneEpisodes = await db.scriptScene.findMany({
            where: { scriptId },
            select: { episodeNum: true },
            distinct: ["episodeNum"],
          })
          for (const { episodeNum } of doneEpisodes) {
            existingEpisodes.add(episodeNum)
          }

          // Get existing scene counters
          const counts = await db.scriptScene.groupBy({
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
          await db.script.update({
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

          // Upload PDF to Supabase Storage (best-effort)
          let pdfStorageUrl: string | undefined
          if (isStorageConfigured() && pdfFileRef) {
            try {
              const pdfBuffer = Buffer.from(await pdfFileRef.arrayBuffer())
              const cleanName = (filename || "script.pdf").replace(/[^a-zA-Z0-9._-]/g, "_")
              const storagePdfPath = `${session.user.id}/${Date.now()}-${cleanName}`
              pdfStorageUrl = await uploadToStorage("scripts", storagePdfPath, pdfBuffer, "application/pdf")
              emit({ type: "status", step: "PDF uploaded to storage ✓" })
            } catch (err) {
              console.warn("PDF storage upload failed (continuing):", err)
            }
          }

          // Try to extract title from PDF text immediately (before AI) — so even if
          // the stream breaks later, we have a correct title instead of the raw filename
          const earlyTitle = extractTitleFromRawText(text) || filename
            ?.replace(/\.pdf$/i, "")
            .replace(/\s*[\[(]?\d+-\d+(?:pages?)?\s*[\])]?\s*$/i, "")
            .replace(/[_\s]+v\d+[_\s]*\d{4,8}\s*$/i, "")
            .replace(/[_\s]+\d{4,8}\s*$/i, "")
            .replace(/^[A-Za-z']+(?:\s+[A-Za-z]+){0,2}[''s]*\s*(?:version|draft|edit|copy|script)[-–_\s]+/i, "")
            .trim() || "Importing..."

          // Create script immediately so user has a scriptId even if we fail
          const script = await db.script.create({
            data: {
              userId: session.user.id,
              title: earlyTitle,
              genre: genre || "drama",
              format: format || "series",
              language: language || "en",
              targetEpisodes: episodeChunks.length || targetEpisodes || 1,
              status: "importing",
              metadata: pdfStorageUrl ? JSON.stringify({ pdfUrl: pdfStorageUrl, pdfName: filename }) : undefined,
            },
          })
          scriptId = script.id
        }

        emit({ type: "script_created", scriptId })
        scriptIdForTouch = scriptId // enable periodic updatedAt touch

        // ── Process chunks (parallel by episode, sequential within episode) ──
        const allRoles: RoleParsed[] = []
        let globalTitle: string | undefined
        let globalGenre: string | undefined
        let titleExtracted = !!resumeScriptId
        let processedCount = 0

        // Accumulators for pre-computed asset data
        const roleStorylineMap = new Map<string, StorylineEntry[]>()
        const locationMap = new Map<string, { type: string; sceneKeys: string[]; sceneDataEntries: object[] }>()

        // Group parts by episode (parts within same episode must run sequentially)
        const episodeGroups = new Map<number, typeof allParts>()
        for (const part of allParts) {
          if (!episodeGroups.has(part.episodeNum)) episodeGroups.set(part.episodeNum, [])
          episodeGroups.get(part.episodeNum)!.push(part)
        }

        // Process a single part (AI call + DB save + accumulate)
        async function processPart(
          part: typeof allParts[0],
          isFirstExtract: boolean,
        ): Promise<ChunkResult> {
          const startSceneNum = epSceneCounters[part.episodeNum] || 0

          const userMsg = isFirstExtract
            ? `Parse this screenplay completely and faithfully. Episode number: ${part.episodeNum}. Every scene, every line of dialogue, every action — copy it verbatim:\n\n${part.text}`
            : `Parse this screenplay section completely and faithfully. Episode number: ${part.episodeNum} (continuation, part ${part.partIndex + 1}). Scene numbering should continue from scene ${startSceneNum + 1}. Copy all content verbatim:\n\n${part.text}`

          const result = await aiComplete({
            messages: [
              { role: "system", content: PDF_IMPORT_SYSTEM_PROMPT },
              { role: "user", content: userMsg },
            ],
            temperature: 0.1,
            maxTokens: 32000,
            responseFormat: "json",
          })
          return extractJSON<ChunkResult>(result.content) || {}
        }

        // Save chunk results to DB + accumulate in-memory data
        function saveChunkResults(
          part: typeof allParts[0],
          chunkResult: ChunkResult,
        ) {
          // Collect roles (deduplicated)
          if (chunkResult.roles?.length) {
            for (const role of chunkResult.roles) {
              if (role.name && !allRoles.find(r => r.name.toLowerCase() === role.name.toLowerCase())) {
                allRoles.push(role)
              }
            }
          }

          if (!chunkResult.scenes?.length) return []

          const startSceneNum = epSceneCounters[part.episodeNum] || 0
          const scenesToSave = chunkResult.scenes.map((scene, j) => {
            const computedSceneNum = part.partIndex > 0 ? startSceneNum + j + 1 : (scene.sceneNum || j + 1)
            const sceneKey = `E${part.episodeNum}S${computedSceneNum}`
            const blocks = (Array.isArray(scene.action) ? scene.action : []) as Array<{ type?: string; character?: string; line?: string; text?: string }>
            const sceneInfo = {
              key: sceneKey,
              sceneId: "",
              heading: scene.heading || "",
              location: scene.location || "",
              timeOfDay: scene.timeOfDay || "",
              mood: scene.mood || "",
            }

            const { characters, storylineEntries, actionPlainText } = extractSceneData(blocks, sceneInfo)

            // Accumulate character storylines
            for (const [name, entry] of Object.entries(storylineEntries)) {
              if (!roleStorylineMap.has(name)) roleStorylineMap.set(name, [])
              roleStorylineMap.get(name)!.push(entry)
            }

            // Accumulate location appearances
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

            return {
              scriptId,
              episodeNum: part.episodeNum,
              sceneNum: computedSceneNum,
              sortOrder: (part.episodeNum - 1) * 10000 + computedSceneNum,
              heading: scene.heading || "",
              location: scene.location || "",
              timeOfDay: scene.timeOfDay || "",
              action: Array.isArray(scene.action) ? JSON.stringify(scene.action) : (typeof scene.action === "string" ? scene.action : ""),
              mood: scene.mood || "",
              promptHint: scene.promptHint || "",
              duration: scene.duration || 60,
              characters,
              actionPlainText,
            }
          })

          epSceneCounters[part.episodeNum] = startSceneNum + chunkResult.scenes.length
          return scenesToSave
        }

        // Cancellation flag — set true if script is deleted mid-import
        let cancelled = false

        // Check if script still exists (deleted by user → stop import)
        async function checkScriptAlive(): Promise<boolean> {
          if (cancelled) return false
          try {
            const exists = await db.script.findUnique({ where: { id: scriptId }, select: { id: true } })
            if (!exists) {
              cancelled = true
              return false
            }
            return true
          } catch {
            return true // DB error → don't cancel, let it retry
          }
        }

        // Process one full episode (all its parts sequentially)
        async function processEpisode(parts: typeof allParts) {
          for (const part of parts) {
            // Check if script was deleted — stop immediately
            if (cancelled || !(await checkScriptAlive())) {
              emit({ type: "cancelled", reason: "Script was deleted" })
              return
            }

            // Skip already-imported episodes on resume
            if (existingEpisodes.has(part.episodeNum)) {
              processedCount++
              emit({ type: "skip", chunk: processedCount, total: allParts.length, episode: part.episodeNum })
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

            try {
              const chunkResult = await processPart(part, isFirstExtract)

              // Extract title/genre from first successful chunk
              if (isFirstExtract) {
                globalTitle = chunkResult.title
                globalGenre = chunkResult.genre
                titleExtracted = true
              }

              const scenesToSave = saveChunkResults(part, chunkResult)
              if (scenesToSave.length > 0) {
                await db.scriptScene.createMany({ data: scenesToSave })
                totalScenesCreated += scenesToSave.length
              }

              emit({
                type: "chunk_done",
                chunk: processedCount,
                episode: part.episodeNum,
                scenes: chunkResult.scenes?.length || 0,
                totalScenes: totalScenesCreated,
              })
            } catch (err) {
              console.error(`PDF import: ep${part.episodeNum} part${part.partIndex} failed:`, err)
              emit({
                type: "chunk_error",
                chunk: processedCount,
                episode: part.episodeNum,
                error: String(err),
              })
            }
          }
        }

        // Process first episode alone to extract title/genre/roles
        const episodeNums = Array.from(episodeGroups.keys()).sort((a, b) => a - b)
        if (episodeNums.length > 0) {
          await processEpisode(episodeGroups.get(episodeNums[0])!)
        }

        // Process remaining episodes in parallel batches of 2
        const EPISODE_CONCURRENCY = 2
        for (let i = 1; i < episodeNums.length && !cancelled; i += EPISODE_CONCURRENCY) {
          const batch = episodeNums.slice(i, i + EPISODE_CONCURRENCY)
          await Promise.all(batch.map(epNum => processEpisode(episodeGroups.get(epNum)!)))
        }

        // ── Post-processing (skip if script was deleted) ──────────────────
        if (cancelled) {
          return finish({ type: "cancelled", scriptId, reason: "Script was deleted during import" })
        }

        // Step 1: Save locations + roles in parallel (independent of each other)
        let totalRolesCount = 0
        const [, rolesResult] = await Promise.all([
          // Save locations
          locationMap.size > 0
            ? Promise.all(
                Array.from(locationMap.entries()).map(([name, data]) =>
                  db.scriptLocation.upsert({
                    where: { scriptId_name: { scriptId, name } },
                    create: { scriptId, name, type: data.type, sceneKeys: data.sceneKeys, sceneData: JSON.stringify(data.sceneDataEntries) },
                    update: { sceneKeys: data.sceneKeys, sceneData: JSON.stringify(data.sceneDataEntries) },
                  })
                )
              ).catch(err => console.error("[ImportPDF] location upsert failed:", err))
            : Promise.resolve(),
          // Save roles (new ones only)
          (async () => {
            if (!allRoles.length) return
            const existingRoles = await db.scriptRole.findMany({
              where: { scriptId },
              select: { name: true },
            })
            const existingNames = new Set(existingRoles.map(r => r.name.toLowerCase()))
            const newRoles = allRoles.filter(r => !existingNames.has(r.name.toLowerCase()))
            if (newRoles.length > 0) {
              await db.scriptRole.createMany({
                data: newRoles.map(r => ({
                  scriptId,
                  name: r.name || "Unknown",
                  role: ["lead", "supporting", "minor"].includes(r.role) ? r.role : "supporting",
                  description: r.description || "",
                })),
              })
            }
            totalRolesCount = await db.scriptRole.count({ where: { scriptId } })
          })(),
        ])
        void rolesResult // suppress unused warning

        // Step 2: Save role storylines + finalize script in parallel
        //   (storylines depend on roles existing, but script finalize is independent)
        const textExtractedTitle = !globalTitle
          ? extractTitleFromRawText(allParts[0]?.text || "")
          : null
        const cleanFilename = filename
          ?.replace(/\.pdf$/i, "")
          .replace(/\s*[\[(]?\d+-\d+(?:pages?)?\s*[\])]?\s*$/i, "")
          .replace(/[_\s]+v\d+[_\s]*\d{4,8}\s*$/i, "")
          .replace(/[_\s]+\d{4,8}\s*$/i, "")
          .replace(/^[A-Za-z']+(?:\s+[A-Za-z]+){0,2}[''s]*\s*(?:version|draft|edit|copy|script)[-–_\s]+/i, "")
          .trim()
        const finalTitle = globalTitle || textExtractedTitle || cleanFilename || "Imported Script"
        const finalGenre = globalGenre || genre || "drama"

        await Promise.all([
          // Save role storylines (roles now exist in DB from step 1)
          roleStorylineMap.size > 0
            ? (async () => {
                const savedRoles = await db.scriptRole.findMany({
                  where: { scriptId },
                  select: { id: true, name: true },
                })
                await Promise.all(
                  savedRoles.map(role => {
                    const entries = roleStorylineMap.get(role.name.trim().toUpperCase()) || []
                    if (!entries.length) return Promise.resolve()
                    return db.scriptRole.update({
                      where: { id: role.id },
                      data: { storyline: JSON.stringify(entries) },
                    })
                  })
                )
              })().catch(err => console.error("[ImportPDF] storyline update failed:", err))
            : Promise.resolve(),
          // Finalize script record (status depends on whether images will be generated)
          (async () => {
            const anyImages = genImages.characters || genImages.locations || genImages.props || genImages.cover
            const existingScript = await db.script.findUnique({ where: { id: scriptId }, select: { metadata: true } })
            const existingMeta = existingScript?.metadata ? (() => { try { return JSON.parse(existingScript.metadata) } catch { return {} } })() : {}
            await db.script.update({
              where: { id: scriptId },
              data: {
                title: finalTitle,
                genre: finalGenre,
                status: anyImages && !cancelled ? "generating" : "draft",
                targetEpisodes: episodeChunks.length || targetEpisodes || 1,
                metadata: JSON.stringify(existingMeta),
              },
            })
          })(),
        ])

        // ── Phase 2: Auto-generate images ──────────────────────────────────
        const anyImages = genImages.characters || genImages.locations || genImages.props || genImages.cover
        let totalImagesGenerated = 0

        if (anyImages && !cancelled) {
          emit({ type: "images_start" })

          type ImageTask = {
            kind: "character" | "location" | "prop" | "cover"
            label: string
            priority: number
            execute: () => Promise<void>
          }
          const imageTasks: ImageTask[] = []

          // Generate a unified visual style anchor (~3s)
          let styleAnchor = ""
          try {
            emit({ type: "images_progress", step: "Defining visual style...", current: 0, total: 0 })
            const characterSummary = allRoles.map(r => `${r.name} (${r.role})`).join(", ")
            const locationSummary = Array.from(locationMap.keys()).slice(0, 6).join(", ")
            styleAnchor = await generateStyleAnchor({
              title: finalTitle,
              genre: finalGenre,
              characterSummary,
              locationSummary,
            })
            console.log("[ImportPDF] Style anchor:", styleAnchor.substring(0, 100))
          } catch (err) {
            console.warn("[ImportPDF] Style anchor generation failed, continuing:", err)
          }

          // Fetch saved roles for image generation
          const imgRoles = await db.scriptRole.findMany({
            where: { scriptId },
            select: { id: true, name: true, role: true, description: true, storyline: true },
          })

          // Character portrait tasks (all roles)
          if (genImages.characters) {
            for (const role of imgRoles) {
              imageTasks.push({
                kind: "character",
                label: role.name,
                priority: role.role === "lead" ? 0 : 1,
                execute: async () => {
                  chargeAiFeatureSilent(session.user.id, "generate_character")
                  const result = await generateCharacterPortrait({
                    userId: session.user.id,
                    name: role.name,
                    description: role.description || "",
                    role: role.role,
                    genre: finalGenre,
                    storylineJson: role.storyline,
                    styleAnchor,
                  })
                  await db.scriptRole.update({
                    where: { id: role.id },
                    data: { avatarUrl: result.imageUrl, referenceImages: { push: result.imageUrl } },
                  })
                },
              })
            }
          }

          // Location photo tasks (top 8 by scene count)
          if (genImages.locations) {
            const imgLocations = await db.scriptLocation.findMany({
              where: { scriptId },
              select: { id: true, name: true, type: true, description: true, sceneData: true, sceneKeys: true },
            })
            const topLocs = imgLocations
              .sort((a, b) => (b.sceneKeys?.length || 0) - (a.sceneKeys?.length || 0))
              .slice(0, 8)

            for (const loc of topLocs) {
              imageTasks.push({
                kind: "location",
                label: loc.name,
                priority: 2,
                execute: async () => {
                  chargeAiFeatureSilent(session.user.id, "generate_location_photo")
                  const result = await generateLocationPhoto({
                    userId: session.user.id,
                    locName: loc.name,
                    type: loc.type,
                    description: loc.description || undefined,
                    sceneDataJson: loc.sceneData,
                    styleAnchor,
                  })
                  await db.scriptLocation.update({
                    where: { id: loc.id },
                    data: {
                      photoUrl: result.url,
                      photoPrompt: result.prompt,
                      photos: JSON.stringify([{ url: result.url, isApproved: false }]),
                    },
                  })
                },
              })
            }
          }

          // Props: extract via AI then generate photos for key props
          if (genImages.props) {
            try {
              emit({ type: "images_progress", step: "Extracting props...", current: 0, total: 0 })
              const scenesForProps = await db.scriptScene.findMany({
                where: { scriptId },
                select: { episodeNum: true, sceneNum: true, heading: true, action: true },
                orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
                take: 20,
              })
              const extractedProps = await extractPropsFromScenes({
                scenes: scenesForProps.map(s => ({ ...s, action: s.action || "" })),
              })
              if (extractedProps.length > 0) {
                await db.scriptProp.createMany({
                  data: extractedProps.map(p => ({
                    scriptId,
                    name: p.name,
                    category: p.category || "other",
                    description: p.description || null,
                    isKey: p.isKey ?? false,
                  })),
                  skipDuplicates: true,
                })
                chargeAiFeatureSilent(session.user.id, "extract_props")

                // Key prop photo tasks (top 5)
                const keyProps = await db.scriptProp.findMany({
                  where: { scriptId, isKey: true },
                  select: { id: true, name: true, category: true, description: true, sceneData: true },
                  take: 5,
                })
                for (const prop of keyProps) {
                  imageTasks.push({
                    kind: "prop",
                    label: prop.name,
                    priority: 3,
                    execute: async () => {
                      chargeAiFeatureSilent(session.user.id, "generate_prop_photo")
                      const result = await generatePropPhoto({
                        userId: session.user.id,
                        propName: prop.name,
                        category: prop.category,
                        description: prop.description || undefined,
                        sceneDataJson: prop.sceneData,
                        styleAnchor,
                      })
                      await db.scriptProp.update({
                        where: { id: prop.id },
                        data: {
                          photoUrl: result.url,
                          photos: JSON.stringify([{ url: result.url, isApproved: false }]),
                        },
                      })
                    },
                  })
                }
              }
            } catch (err) {
              console.warn("[ImportPDF] Prop extraction failed, continuing:", err)
            }
          }

          // Cover for episode 1
          if (genImages.cover) {
            imageTasks.push({
              kind: "cover",
              label: "Episode 1 Cover",
              priority: 4,
              execute: async () => {
                chargeAiFeatureSilent(session.user.id, "generate_cover")
                const ep1Scenes = await db.scriptScene.findMany({
                  where: { scriptId, episodeNum: 1 },
                  orderBy: { sceneNum: "asc" },
                  select: { sceneNum: true, location: true, action: true },
                })
                const sceneSummary = ep1Scenes.map(s =>
                  `Scene ${s.sceneNum}: ${s.location || ""} - ${(s.action || "").slice(0, 100)}`
                ).join("\n")
                const characterNames = imgRoles.map(r => r.name).join(", ")
                const result = await generateCoverForEpisode({
                  userId: session.user.id,
                  scriptId,
                  episodeNum: 1,
                  title: finalTitle,
                  genre: finalGenre,
                  sceneSummary,
                  characterNames,
                  styleAnchor,
                })
                await db.script.update({
                  where: { id: scriptId },
                  data: { coverTall: result.coverUrl, coverImage: result.coverUrl },
                })
              },
            })
          }

          // Sort by priority and cap at 20
          imageTasks.sort((a, b) => a.priority - b.priority)
          const cappedTasks = imageTasks.slice(0, 20)
          const IMAGE_CONCURRENCY = 3
          const IMAGE_PHASE_TIMEOUT_MS = 180_000
          const imagePhaseStart = Date.now()
          let imagesDone = 0

          emit({ type: "images_progress", step: "Generating images...", current: 0, total: cappedTasks.length })

          // Execute in batches of IMAGE_CONCURRENCY
          for (let i = 0; i < cappedTasks.length; i += IMAGE_CONCURRENCY) {
            if (cancelled || Date.now() - imagePhaseStart > IMAGE_PHASE_TIMEOUT_MS) break
            const batch = cappedTasks.slice(i, i + IMAGE_CONCURRENCY)
            await Promise.all(batch.map(async task => {
              if (Date.now() - imagePhaseStart > IMAGE_PHASE_TIMEOUT_MS) return
              if (cancelled || !(await checkScriptAlive())) return
              try {
                await task.execute()
                imagesDone++
                emit({
                  type: "image_done",
                  kind: task.kind,
                  label: task.label,
                  current: imagesDone,
                  total: cappedTasks.length,
                })
              } catch (err) {
                imagesDone++
                console.error(`[ImportPDF] Image gen failed (${task.kind}: ${task.label}):`, err)
                emit({
                  type: "image_error",
                  kind: task.kind,
                  label: task.label,
                  error: String(err),
                  current: imagesDone,
                  total: cappedTasks.length,
                })
              }
            }))
          }

          totalImagesGenerated = imagesDone
          emit({ type: "images_done", generated: imagesDone, total: cappedTasks.length })

          // Set final status to "draft" now that images are done
          await db.script.update({
            where: { id: scriptId },
            data: { status: "draft" },
          }).catch(() => {})
        }

        finish({
          type: "done",
          scriptId,
          title: finalTitle,
          scenes: totalScenesCreated,
          roles: totalRolesCount,
          episodes: episodeChunks.length,
          images: totalImagesGenerated,
        })
      } catch (error) {
        console.error("PDF import fatal error:", error)
        emit({ type: "error", error: "Import failed: " + String(error) })
        try { controller.close() } catch { /* already closed */ }
      } finally {
        activeImports = Math.max(0, activeImports - 1)
        clearInterval(heartbeat)
        clearInterval(dbTouch)
        await db.$disconnect().catch(() => {})
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
