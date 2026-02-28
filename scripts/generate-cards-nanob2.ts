/**
 * Generate landing page card images using Nano Banano 2 (Gemini 3.1 Flash Image Preview)
 * via OpenRouter API.
 *
 * Usage:
 *   set -a && source .env.local && set +a && npx tsx scripts/generate-cards-nanob2.ts
 *
 * Requires OPENROUTER_API_KEY env var.
 * Images are uploaded to R2 storage under covers/landing/ prefix.
 */

import { uploadToStorage, isStorageConfigured, storagePath } from "@/lib/storage"

const SYSTEM_USER_ID = "system"
const MODEL = "google/gemini-3.1-flash-image-preview"
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

const CARD_PROMPTS = [
  {
    name: "card-common",
    prompt: `A collectible character card for a short drama app. COMMON rarity.

Composition: Cinematic still, intimate close-up portrait. A gorgeous young European woman with delicate features, soft makeup, honey-blonde hair cascading over one shoulder. She's wearing a simple white silk blouse, slightly unbuttoned. Warm golden hour sunlight streaming through a café window illuminates her face. She gazes directly at camera with a slight knowing smile, green eyes sparkling. Shallow depth of field, bokeh background.

Card frame: Clean silver metallic border. Small text "COMMON" in silver at bottom.
Style: Korean drama poster aesthetic, warm tones, soft natural lighting. Real photographic portrait, not illustration. Vertical 3:4 ratio.
No text except "COMMON".`,
  },
  {
    name: "card-rare",
    prompt: `A collectible character card for a short drama app. RARE rarity.

Composition: Action drama still, medium close-up. A handsome young European man with sharp jawline, dark stubble, piercing blue eyes. He's wearing a fitted black suit with shirt partially open revealing muscular chest. Walking away from a luxury car at night, one hand loosening his tie. Cold neon city lights reflect off his face. Expression is intense and dangerous.

Card frame: Blue metallic border with subtle electric blue glow at edges. Text "RARE" in glowing blue at bottom.
Style: Thriller movie poster aesthetic, cool tones, cinematic side lighting, dramatic shadows. Real photographic portrait, not illustration. Vertical 3:4 ratio.
No text except "RARE".`,
  },
  {
    name: "card-epic",
    prompt: `A collectible character card for a short drama app. EPIC rarity.

Composition: Extreme close-up, face and shoulders only. A stunning European woman with smoky eye makeup, full lips slightly parted, seductive and challenging gaze. Her hand lightly touches her lower lip. Purple and rose-gold lighting paints dramatic shadows across her flawless features. Wind-blown dark hair. She looks like a femme fatale from a thriller romance.

Card frame: Purple and rose-gold ornate border with delicate filigree patterns and soft purple glow. Text "EPIC" in glowing purple at bottom.
Style: High fashion editorial meets drama poster, atmospheric purple lighting, extreme beauty close-up. Real photographic portrait, not illustration. Vertical 3:4 ratio.
No text except "EPIC".`,
  },
  {
    name: "card-legendary",
    prompt: `A collectible character card for a short drama app. LEGENDARY rarity.

Composition: Epic hero shot, low angle. A powerfully built European man, shirtless with sculpted abs and chest muscles, wearing gold-accented warrior-style leather armor on lower body. He stands on a cliff edge during a thunderstorm. Rain runs down his muscular body. Golden lightning illuminates his chiseled, determined face. Heroic low-angle perspective.

Card frame: Luxurious gold border encrusted with diamonds and amber gemstones, holographic rainbow sheen. Text "LEGENDARY" in glorious golden font at bottom.
Style: Epic blockbuster movie poster, real photographic, golden lighting + lightning effects. Vertical 3:4 ratio.
No text except "LEGENDARY".`,
  },
]

async function generateImage(name: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY")

  console.log(`\n🎨 Generating: ${name}...`)
  console.log(`   Prompt: ${prompt.substring(0, 100)}...`)

  const body = {
    model: MODEL,
    messages: [
      {
        role: "user" as const,
        content: prompt,
      },
    ],
    modalities: ["image", "text"],
    // @ts-expect-error - OpenRouter specific field
    image_config: {
      aspectRatio: "3:4",
      imageSize: "2K",
    },
  }

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 2 minute timeout
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${errText.substring(0, 500)}`)
  }

  const data = await res.json()

  // Try to extract image from various response formats
  // Format 1: message.images array (OpenRouter image gen)
  const images = data.choices?.[0]?.message?.images
  if (images && images.length > 0) {
    const imgUrl = images[0].image_url?.url || images[0].url
    if (imgUrl) {
      console.log(`   ✅ Got image (images array format)`)
      return imgUrl
    }
  }

  // Format 2: message.content as array with image parts (Gemini style)
  const content = data.choices?.[0]?.message?.content
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "image_url" && part.image_url?.url) {
        console.log(`   ✅ Got image (content array format)`)
        return part.image_url.url
      }
      if (part.type === "image" && part.data) {
        console.log(`   ✅ Got image (inline data format)`)
        return `data:image/png;base64,${part.data}`
      }
    }
  }

  // Format 3: Direct base64 in content string
  if (typeof content === "string" && content.startsWith("data:image")) {
    console.log(`   ✅ Got image (direct data URL)`)
    return content
  }

  // Debug: print response structure
  console.error(`   ❌ Could not extract image. Response structure:`)
  console.error(JSON.stringify(data, null, 2).substring(0, 2000))
  throw new Error("No image found in response")
}

async function uploadImage(name: string, dataUrl: string): Promise<string> {
  let buffer: Buffer

  if (dataUrl.startsWith("data:")) {
    const b64 = dataUrl.split(",")[1]
    buffer = Buffer.from(b64, "base64")
  } else if (dataUrl.startsWith("http")) {
    // It's a URL, fetch it
    const res = await fetch(dataUrl)
    buffer = Buffer.from(await res.arrayBuffer())
  } else {
    throw new Error("Unknown image format")
  }

  console.log(`   📦 Image size: ${Math.round(buffer.length / 1024)}KB`)

  if (!isStorageConfigured()) {
    const fs = await import("fs")
    const outPath = `/tmp/${name}.png`
    fs.writeFileSync(outPath, buffer)
    console.log(`   💾 Saved to ${outPath}`)
    return outPath
  }

  const path = storagePath(SYSTEM_USER_ID, "covers", `landing/${name}.png`)
  const url = await uploadToStorage("covers", path, buffer, "image/png")
  console.log(`   ✅ Uploaded: ${url}`)
  return url
}

async function main() {
  console.log("═══════════════════════════════════════════")
  console.log("  OpenDrama Landing Card Generator")
  console.log("  Using Nano Banano 2 (Gemini 3.1 Flash)")
  console.log("═══════════════════════════════════════════")

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("❌ Missing OPENROUTER_API_KEY environment variable")
    process.exit(1)
  }

  const results: Record<string, string> = {}

  for (const card of CARD_PROMPTS) {
    try {
      const imageData = await generateImage(card.name, card.prompt)
      const url = await uploadImage(card.name, imageData)
      results[card.name] = url
    } catch (err) {
      console.error(`   ❌ Failed: ${card.name}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log("\n═══════════════════════════════════════════")
  console.log("  Results Summary")
  console.log("═══════════════════════════════════════════")
  for (const [name, url] of Object.entries(results)) {
    console.log(`  ${name}: ${url}`)
  }
  console.log(`\n  Total generated: ${Object.keys(results).length}/4`)
  console.log("═══════════════════════════════════════════")
}

main().catch(console.error)
