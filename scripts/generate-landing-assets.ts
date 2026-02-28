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
    prompt: `一张短剧应用的收藏角色卡牌。COMMON 普通稀有度。
画面构图：电影剧照风格，近景特写。一个年轻漂亮的欧美女性，精致妆容，侧脸转向镜头，眼神含情脉脉。她穿着简约的白衬衫，微微解开两颗扣子。背景是咖啡厅窗边，阳光洒在脸上，浅景深虚化。
卡牌边框：简洁银色金属边框。底部小字"COMMON"银色。
电影剧照质感，真人写实，暖色调，柔和自然光线，浅景深。竖版3:4比例。
韩剧海报质感，唯美光影。
除"COMMON"外无其他文字。`,
  },
  {
    name: "card-rare",
    prompt: `一张短剧应用的收藏角色卡牌。RARE 稀有稀有度。
画面构图：动作剧照风格，中近景。一个帅气的欧美年轻男性，穿着合身的黑色西装，衬衫微敞，展现健壮胸肌。他正从豪车旁走来，一手松着领带，表情冷峻而危险。夜晚城市霓虹灯光映在他脸上。
卡牌边框：蓝色金属边框，边缘有微妙的电蓝色光芒。底部"RARE"蓝色发光字。
电影剧照风格，真人写实，冷色调电影打光，侧面轮廓光。竖版3:4比例。
悬疑剧海报质感，暗调高对比，电影感构图。
除"RARE"外无其他文字。`,
  },
  {
    name: "card-epic",
    prompt: `一张短剧应用的收藏角色卡牌。EPIC 史诗稀有度。
画面构图：极致近景特写，只拍脸部和肩部。一个绝美的欧美女性，烟熏妆，嘴唇微张，眼神挑衅又妩媚。她的手轻触嘴唇。紫色和玫瑰色的灯光打在她精致的五官上，头发被风吹起。
卡牌边框：紫色和玫瑰金色华丽边框，带细腻花纹和柔和紫色光晕。底部"EPIC"紫色发光字。
极致特写，真人写实，紫色戏剧性光线，仿佛悬疑爱情剧的关键场景截图。竖版3:4比例。
高级时尚大片质感，氛围感强烈。
除"EPIC"外无其他文字。`,
  },
  {
    name: "card-legendary",
    prompt: `一张短剧应用的收藏角色卡牌。LEGENDARY 传奇稀有度。
画面构图：史诗级剧照全景+近景混合。一个气场强大的欧美男性，赤裸上身展现雕塑般的腹肌和胸肌，穿着金色战士风格的皮甲下装。他站在暴风雨中的悬崖边，雨水顺着他的肌肉线条流下，金色闪电照亮他坚毅的面容。仰拍角度，英雄感满满。
卡牌边框：奢华金色边框镶嵌钻石和琥珀宝石，全息彩虹光泽。底部"LEGENDARY"金色辉煌字体。
史诗电影级画面，真人写实，金色打光+闪电效果，英雄电影海报质感。竖版3:4比例。
好莱坞大片海报质感，震撼视觉冲击。
除"LEGENDARY"外无其他文字。`,
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
