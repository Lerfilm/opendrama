/**
 * Generate 9:16 vertical covers for the 5 Hot Picks series.
 * Run: node scripts/gen-covers.mjs
 */
import { readFileSync } from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)

// ── Load env ──────────────────────────────────────────────
const envLocal = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([^#=][^=]*)=(.*)$/)
  if (m) {
    const key = m[1].trim()
    const val = m[2].trim().replace(/^["']|["']$/g, "")
    if (!process.env[key]) process.env[key] = val
  }
}
// Use DIRECT_URL so prisma can connect from local
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

// ── Imports (after env loaded) ─────────────────────────────
const https = require("https")

const ARK_API_KEY = process.env.ARK_API_KEY || ""
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""

// ARK image generation model
const T2I_MODEL = "doubao-seedream-3-0-t2i-250415"
const ARK_BASE = "ark.cn-beijing.volces.com"

// Series IDs to update (from Hot Picks)
const SERIES_IDS = [
  "c8uxt6ludr24mlsqxc2s", // Flash Marriage CEO
  "c3vljcwpukdjmlsqxc2s", // Urban Rise
  "cp46pchlcr5kmlsqxc2s", // Reborn Heiress
  "c3d24lvid4ihmlsqxc2s", // The Royal Physician
  "ceyfy7kavk5mlsqxc2s",  // Dragon King Returns
]

// ── ARK Image Generation ───────────────────────────────────
async function generateCoverImage(prompt) {
  const body = JSON.stringify({
    model: T2I_MODEL,
    prompt,
    size: "1080x1920",
    n: 1,
  })

  return new Promise((resolve, reject) => {
    const options = {
      hostname: ARK_BASE,
      path: "/api/v3/images/generations",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ARK_API_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }
    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", d => data += d)
      res.on("end", () => {
        try {
          const json = JSON.parse(data)
          const url = json.data?.[0]?.url
          if (!url) reject(new Error(`No image URL: ${data.slice(0, 300)}`))
          else resolve(url)
        } catch { reject(new Error(`JSON parse failed: ${data.slice(0, 200)}`)) }
      })
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

// ── OpenRouter AI helper ───────────────────────────────────
async function aiComplete(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a cover art director for Chinese short-form vertical dramas (竖屏短剧).
Generate a vivid, cinematic image prompt in English for a 9:16 vertical poster.

Style requirements:
- Photorealistic, dramatic lighting (strong rim light, backlight, or neon glow)
- Focused on 1-2 characters: close-up or medium shot, intense emotional expression
- Cinematic composition for vertical/portrait orientation (9:16)
- High contrast, rich colors — bold shadows and highlights
- Atmosphere: tension, desire, betrayal, romance, or power struggle
- Real-life settings: office, luxury villa, street at night, hospital corridor, etc.
- Inspired by popular Chinese short drama aesthetics (抖音短剧 style)
- NO text, NO watermark, NO subtitles in the image
- Output: one compact English prompt, under 800 characters`,
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.9,
    })

    const options = {
      hostname: "openrouter.ai",
      path: "/api/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }
    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", d => data += d)
      res.on("end", () => {
        try {
          const json = JSON.parse(data)
          resolve(json.choices?.[0]?.message?.content || "")
        } catch { reject(new Error(`AI parse failed: ${data.slice(0, 200)}`)) }
      })
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

// ── DB update via Prisma ───────────────────────────────────
function createPrisma() {
  const { PrismaClient } = require("@prisma/client")
  const { PrismaPg } = require("@prisma/adapter-pg")
  const { Pool } = require("pg")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

async function updateSeriesCovers(seriesId, scriptId, coverUrl) {
  const prisma = createPrisma()
  try {
    await prisma.series.update({
      where: { id: seriesId },
      data: { coverTall: coverUrl, coverUrl: coverUrl },
    })
    if (scriptId) {
      await prisma.script.update({
        where: { id: scriptId },
        data: { coverTall: coverUrl, coverImage: coverUrl },
      })
    }
  } finally {
    await prisma.$disconnect()
  }
}

async function getSeriesData(seriesIds) {
  const prisma = createPrisma()
  try {
    const series = await prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: {
        id: true, title: true, genre: true, description: true,
        scriptId: true,
        script: {
          select: {
            id: true,
            synopsis: true,
            scenes: { select: { sceneNum: true, location: true, action: true }, orderBy: { sceneNum: "asc" }, take: 5 },
            roles: { select: { name: true }, take: 5 },
          }
        }
      }
    })
    return series
  } finally {
    await prisma.$disconnect()
  }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  console.log("🎬 Fetching series data...")
  const seriesData = await getSeriesData(SERIES_IDS)
  console.log(`Found ${seriesData.length} series\n`)

  for (const s of seriesData) {
    console.log(`\n━━━ ${s.title} (${s.id}) ━━━`)

    // Build user prompt
    const sceneSummary = (s.script?.scenes || [])
      .map(sc => `Scene ${sc.sceneNum}: ${sc.location || ""} - ${(sc.action || "").slice(0, 100)}`)
      .join("\n")
    const chars = (s.script?.roles || []).map(r => r.name).join(", ")
    const userPrompt = `Title: ${s.title}
Genre: ${s.genre || "drama"}
Characters: ${chars || "unknown"}
Description: ${(s.description || "").slice(0, 200)}
Scenes:
${sceneSummary || "No scene data"}`

    // Generate prompt
    console.log("  🤖 Generating cover prompt...")
    let coverPrompt
    try {
      coverPrompt = await aiComplete(userPrompt)
      console.log(`  Prompt: ${coverPrompt.slice(0, 120)}...`)
    } catch (err) {
      console.error(`  ❌ AI failed: ${err.message}`)
      continue
    }

    // Generate image via ARK (synchronous)
    console.log("  🎨 Generating image via ARK (1080×1920)...")
    let imageUrl
    try {
      imageUrl = await generateCoverImage(coverPrompt)
      console.log(`  ✅ Image URL: ${imageUrl.slice(0, 80)}...`)
    } catch (err) {
      console.error(`  ❌ Image generation failed: ${err.message}`)
      continue
    }

    // Save
    console.log("  💾 Saving to DB...")
    try {
      await updateSeriesCovers(s.id, s.scriptId, imageUrl)
      console.log("  ✅ Saved!")
    } catch (err) {
      console.error(`  ❌ DB save failed: ${err.message}`)
    }
  }

  console.log("\n\n🎉 Done!")
}

main().catch(err => {
  console.error("Fatal:", err)
  process.exit(1)
})
