/**
 * Generate landing page assets using Seedream 4.5 (Volcengine Ark API)
 *
 * Generates:
 * 1. Four collectible card images (Common, Rare, Epic, Legendary)
 * 2. Four pipeline step icons (Script, Cast, Video, Publish)
 *
 * Usage:
 *   npx tsx scripts/generate-landing-assets.ts
 *
 * Requires ARK_API_KEY env var.
 * Images are uploaded to R2 storage under covers/landing/ prefix.
 */

import { aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, isStorageConfigured, storagePath } from "@/lib/storage"

const SYSTEM_USER_ID = "system"

const CARD_PROMPTS = [
  {
    name: "card-common",
    prompt: `A collectible character card for a short drama app. COMMON rarity tier.
A beautiful young European woman with long flowing hair, wearing a stylish crop top and high-waisted jeans, toned athletic figure with visible abs. Standing casually in a sunlit urban rooftop setting. Confident, flirty smile.
Card frame: simple elegant silver metallic border. Small "COMMON" text at bottom in silver.
Professional fashion photography, real human, photorealistic, warm golden hour lighting, shallow depth of field. Card aspect ratio 3:4.
Magazine cover quality, warm tones, soft bokeh background.
No text other than "COMMON". Clean composition.`,
  },
  {
    name: "card-rare",
    prompt: `A collectible character card for a short drama app. RARE rarity tier.
A handsome muscular young European man, shirtless showing defined six-pack abs, wearing dark fitted trousers, dramatic pose with arms crossed. Intense blue eyes, short styled hair. Standing in a modern luxury penthouse with city lights at night behind him.
Card frame: sleek blue metallic border with subtle electric blue glow at edges. "RARE" text at bottom in glowing blue.
Professional fitness photography, real human, photorealistic, dramatic side lighting with cool blue rim light. Card aspect ratio 3:4.
Cinematic moody lighting, deep contrast, GQ magazine quality.
No text other than "RARE". Clean composition.`,
  },
  {
    name: "card-epic",
    prompt: `A collectible character card for a short drama app. EPIC rarity tier.
A stunning European woman with smoky eye makeup, wearing an elegant revealing dark purple dress with a thigh-high slit, athletic toned body. Surrounded by subtle purple and violet atmospheric light effects. Mysterious, seductive expression. Wind blowing through her hair.
Card frame: ornate purple and rose gold border with fine filigree and soft purple glow. "EPIC" text at bottom in luminous purple.
Professional glamour photography, real human, photorealistic, dramatic purple and violet lighting. Card aspect ratio 3:4.
High fashion editorial quality, ethereal atmosphere, deep contrast.
No text other than "EPIC". Clean composition.`,
  },
  {
    name: "card-legendary",
    prompt: `A collectible character card for a short drama app. LEGENDARY rarity tier.
A powerful muscular European man, shirtless with chiseled physique and defined abs, wearing golden warrior-style lower armor/pants. Golden crown on his head, arms outstretched with golden energy radiating outward. Standing in a throne room with golden light rays streaming in.
Card frame: luxurious gold border with diamond and amber gemstone inlays, holographic rainbow sheen. "LEGENDARY" text at bottom in brilliant gold.
Professional cinematic photography, real human, photorealistic, epic golden lighting, lens flares, power pose. Card aspect ratio 3:4.
Blockbuster movie poster quality, rich warm contrast, golden hour radiance.
No text other than "LEGENDARY". Clean composition.`,
  },
]

const PIPELINE_PROMPTS = [
  {
    name: "pipeline-script",
    prompt: `A minimal flat icon design on a dark purple background. A stylized document/script page with lines of text and a pen writing on it. Glowing violet accent. Clean modern icon style, centered composition, no text, no border. Square 1:1 aspect ratio. Simple, modern, minimalist app icon design.`,
  },
  {
    name: "pipeline-cast",
    prompt: `A minimal flat icon design on a dark purple background. A stylized group of three character silhouettes/profiles with a sparkle effect indicating AI casting. Glowing violet accent. Clean modern icon style, centered composition, no text, no border. Square 1:1 aspect ratio. Simple, modern, minimalist app icon design.`,
  },
  {
    name: "pipeline-video",
    prompt: `A minimal flat icon design on a dark purple background. A stylized film camera or clapperboard with play button, suggesting AI video generation. Glowing violet accent. Clean modern icon style, centered composition, no text, no border. Square 1:1 aspect ratio. Simple, modern, minimalist app icon design.`,
  },
  {
    name: "pipeline-publish",
    prompt: `A minimal flat icon design on a dark purple background. A stylized rocket or send arrow launching upward with sparkle trail, suggesting publishing to the world. Glowing violet accent. Clean modern icon style, centered composition, no text, no border. Square 1:1 aspect ratio. Simple, modern, minimalist app icon design.`,
  },
]

async function generateAndUpload(name: string, prompt: string, aspect: "1:1" | "9:16" = "1:1") {
  console.log(`\n🎨 Generating: ${name}...`)
  console.log(`   Prompt: ${prompt.substring(0, 100)}...`)

  const b64DataUrl = await aiGenerateImage(prompt, aspect === "9:16" ? "9:16" : "1:1")

  if (!isStorageConfigured()) {
    console.log(`   ⚠️  R2 storage not configured, saving data URL to disk`)
    const fs = await import("fs")
    const b64 = b64DataUrl.split(",")[1]
    const buffer = Buffer.from(b64, "base64")
    const outPath = `/tmp/${name}.png`
    fs.writeFileSync(outPath, buffer)
    console.log(`   💾 Saved to ${outPath} (${Math.round(buffer.length / 1024)}KB)`)
    return outPath
  }

  // Upload to R2
  const b64 = b64DataUrl.split(",")[1]
  const buffer = Buffer.from(b64, "base64")
  console.log(`   📦 Image size: ${Math.round(buffer.length / 1024)}KB`)

  const path = storagePath(SYSTEM_USER_ID, "covers", `landing/${name}.png`)
  const url = await uploadToStorage("covers", path, buffer, "image/png")
  console.log(`   ✅ Uploaded: ${url}`)
  return url
}

async function main() {
  const onlyCards = process.argv.includes("--cards-only")
  const onlyIcons = process.argv.includes("--icons-only")

  console.log("═══════════════════════════════════════════")
  console.log("  OpenDrama Landing Page Asset Generator")
  console.log("  Using Seedream 4.5 (Volcengine Ark API)")
  if (onlyCards) console.log("  Mode: Cards only")
  if (onlyIcons) console.log("  Mode: Icons only")
  console.log("═══════════════════════════════════════════")

  if (!process.env.ARK_API_KEY) {
    console.error("❌ Missing ARK_API_KEY environment variable")
    process.exit(1)
  }

  const results: Record<string, string> = {}

  // Generate card images (9:16 aspect for tall cards)
  if (!onlyIcons) {
    console.log("\n── Generating Card Images ──")
    for (const card of CARD_PROMPTS) {
      try {
        results[card.name] = await generateAndUpload(card.name, card.prompt, "9:16")
      } catch (err) {
        console.error(`   ❌ Failed: ${card.name}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  // Generate pipeline icons (1:1 aspect)
  if (!onlyCards) {
    console.log("\n── Generating Pipeline Icons ──")
    for (const icon of PIPELINE_PROMPTS) {
      try {
        results[icon.name] = await generateAndUpload(icon.name, icon.prompt, "1:1")
      } catch (err) {
        console.error(`   ❌ Failed: ${icon.name}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  console.log("\n═══════════════════════════════════════════")
  console.log("  Results Summary")
  console.log("═══════════════════════════════════════════")
  for (const [name, url] of Object.entries(results)) {
    console.log(`  ${name}: ${url}`)
  }
  console.log(`\n  Total generated: ${Object.keys(results).length}/8`)
  console.log("═══════════════════════════════════════════")
}

main().catch(console.error)
