export const dynamic = "force-dynamic"
export const maxDuration = 60
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { chargeAiFeature } from "@/lib/ai-pricing"
import { aiComplete, extractJSON } from "@/lib/ai"

/**
 * POST /api/ai/split
 *
 * Enhanced Split: Combines former "Split" + "Stitch" into a single operation.
 * 1. Analyzes all scenes in an episode
 * 2. Inserts transition segments where needed (stitch logic)
 * 3. Generates Seedance 2.0-optimized video prompts for each segment
 * 4. Supports chain mode (I2V with last-frame extraction)
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const charge = await chargeAiFeature(session.user.id, "ai_split")
  if (!charge.ok) {
    return NextResponse.json({ error: "insufficient_balance", balance: charge.balance, required: charge.required }, { status: 402 })
  }

  try {
    const { scriptId, episodeNum, model, resolution } = await req.json()

    if (!scriptId || !episodeNum) {
      return NextResponse.json({ error: "scriptId and episodeNum are required" }, { status: 400 })
    }

    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
      include: {
        scenes: {
          where: { episodeNum },
          orderBy: { sortOrder: "asc" },
        },
        roles: true,
        locations: {
          select: { name: true, type: true, description: true },
        },
      },
    })

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    if (script.scenes.length === 0) {
      return NextResponse.json({ error: "No scenes in this episode" }, { status: 400 })
    }

    // Build scene descriptions for the LLM
    const sceneDescriptions = script.scenes.map((s, i) => {
      const parts = [`Scene ${i + 1} (sceneNum=${s.sceneNum}):`]
      if (s.heading) parts.push(`  Heading: ${s.heading}`)
      if (s.location) parts.push(`  Location: ${s.location}`)
      if (s.timeOfDay) parts.push(`  Time: ${s.timeOfDay}`)
      if (s.mood) parts.push(`  Mood: ${s.mood}`)
      if (s.action) {
        // Parse action blocks if JSON
        let actionText = s.action
        try {
          const blocks = JSON.parse(s.action) as Array<{ type: string; text?: string; line?: string; character?: string }>
          if (Array.isArray(blocks)) {
            actionText = blocks.map(b => {
              if (b.type === "dialogue") return `${b.character}: "${b.line}"`
              return b.text || ""
            }).filter(Boolean).join(" / ")
          }
        } catch { /* use raw */ }
        parts.push(`  Action: ${actionText.slice(0, 500)}`)
      }
      if (s.stageDirection) parts.push(`  Stage Direction: ${s.stageDirection}`)
      if (s.promptHint) parts.push(`  Camera Hint: ${s.promptHint}`)
      return parts.join("\n")
    }).join("\n\n")

    const characterInfo = script.roles.map(r =>
      `- ${r.name} (${r.role}): ${r.description || "N/A"}`
    ).join("\n")

    const locationInfo = (script.locations || []).map(l =>
      `- ${l.name} (${l.type}): ${l.description || ""}`
    ).join("\n")

    const lang = script.language || "en"

    const systemPrompt = lang === "zh"
      ? `你是一位专业的短剧分镜师，精通剪辑节奏与叙事节拍。你的任务是将剧本场景拆分为连续的视频片段，创造有呼吸感的剪辑节奏。

## 核心任务
1. **分析场景间的过渡**：检查相邻场景之间是否需要过渡片段
2. **为每个片段分配节拍类型（beatType）**：决定每个片段在叙事节奏中的角色
3. **拆分为视频片段**：将每个场景拆分为视频片段，确保节奏有呼吸感
4. **生成 AI 视频 Prompt**：每个片段的 prompt 必须针对 Seedance 视频生成模型优化，包含音频/音效提示

## 剪辑节奏原则（呼吸感）

### 节拍类型 beatType
每个片段必须有一个节拍类型，决定时长、景别和运镜：
| beatType | 时长 | 景别 | 运镜 | 用途 |
|---|---|---|---|---|
| hook | 3-5s | 特写/大特写 | 快速推进或甩镜 | 开场抓眼球 |
| establish | 4-6s | 全景/中全景 | 缓慢横摇或固定 | 建立环境 |
| confrontation | 6-10s | 中景到中近景 | 轻微手持/正反打 | 冲突对峙 |
| escalation | 8-12s | 交替特写与中景 | 逐步推进 | 张力升级 |
| emotional_peak | 8-12s | 特写长镜 | 极慢推进或固定 | 情感高潮 |
| reaction | 3-5s | 特写面部 | 固定 | 反应/情绪落点 |
| reveal | 4-8s | 中景→特写 | 缓慢推进 | 揭示/转折 |
| action | 4-8s | 中景到全景 | 跟随运动 | 动作场面 |
| breath | 4-6s | 全景/中景 | 固定或缓漂 | 呼吸留白 |
| cliffhanger | 3-5s | 特写 | 固定或极慢推 | 悬念结尾 |

### 呼吸节奏规则（非常重要）
- **渐短→释放**：紧张段落中，连续片段时长应逐步缩短（10→8→6→4秒），然后用一个较长片段（8-12秒）释放，如同吸气→呼气
- **不要连续4个片段使用相同时长** — 观众会麻木
- **每15-20秒必须有一个叙事转折点** — 新信息、情感变化或视觉惊喜
- **高潮用静** — 最有力的时刻用最安静的运镜（固定或极慢推进），快速剪辑留给张力升级阶段
- **暴风雨前的宁静** — 在重要冲突或揭示前，放一个明显较长的安静镜头（breath），让后续冲击力翻倍

### 场景内弧线结构
**3段短场景（15-25秒）：**
1. 铺垫 establish/hook (4-6s) → 2. 升级 escalation (8-12s) → 3. 落点 reaction/reveal (4-6s)

**4段标准场景（25-40秒）：**
1. 钩子 hook (3-5s) → 2. 展开 confrontation (8-10s) → 3. 高潮 emotional_peak (8-12s) → 4. 悬念 cliffhanger (3-5s)

**5段大场景（40-70秒）：**
1. 钩子 hook (3-5s) → 2. 建立 establish (5-8s) → 3. 升级 escalation (10-12s) → 4. 高潮 emotional_peak (8-12s) → 5. 呼吸+悬念 breath→cliffhanger (5-8s)

## 时长规则
- 有台词对话的片段：**10-12 秒**，确保对话有足够时间完整播放
- 动作/情绪片段（无台词）：**8-10 秒**
- 纯环境/过渡镜头：**4-6 秒**
- 每句台词大约需要 2-3 秒的播放时间
- **宁可偏长，不可偏短** — 台词被截断比多留空白更糟糕

## 输出格式（JSON）
{
  "segments": [
    {
      "segmentIndex": 0,
      "sceneNum": 1,
      "beatType": "hook|establish|confrontation|escalation|emotional_peak|reaction|reveal|action|breath|cliffhanger",
      "durationSec": 10,
      "isTransition": false,
      "prompt": "详细的画面描述... [AUDIO: 音效/音乐提示]",
      "shotType": "wide|medium|close-up|extreme-close-up|full",
      "cameraMove": "static|pan-left|pan-right|tilt-up|tilt-down|dolly-in|dolly-out|tracking|orbit|push-in"
    }
  ]
}

## Prompt 写作规则（Seedance 优化）

### 结构公式
主体 + 动作 + 场景环境 + 光线 + 运镜 + 风格 + 音频提示 + 质量约束

### 关键规则
- 每个 prompt 30-120 个英文单词（即使剧本是中文，prompt 也用英文写）
- 每个片段只描述一个主要动作，不要堆叠多个动作
- 明确使用角色名字（与剧本完全一致）
- 描述具体的视觉元素：服装、表情、光线方向、环境细节
- 运镜用专业术语：dolly in, push in slowly, pan left gently, orbit, tracking shot
- 始终使用 "slow" 和 "gentle" — 避免 "fast" 或 "exaggerated"
- **对话台词**：将角色台词写入 prompt 中，用双引号包裹，例如：The man turns to the woman and says: "你记住，以后不可以用手指指月亮。"

### 音频/音效提示（在 prompt 末尾添加 [AUDIO: ...] 标记）
Seedance 会根据 prompt 内容自动生成对话配音和音效。请在每个 prompt 末尾添加音频方向提示：
- **对话段**：角色台词已在 prompt 中用双引号标注，Seedance 会自动配音
- **情绪氛围**：描述环境音和情绪音乐方向，例如 [AUDIO: Soft piano melody, gentle wind ambient, emotional strings swell]
- **冲击时刻**：[AUDIO: Dramatic impact hit, silence before reveal, tension building bass drone]
- **动作段**：[AUDIO: Rapid footsteps, cloth rustling, intense percussive rhythm]
- **安静段/呼吸**：[AUDIO: Quiet ambient sounds, distant birds, soft breeze, minimal music]
- **悬念/结尾**：[AUDIO: Suspenseful low drone, sudden silence, heartbeat rhythm fading]

### 一致性约束（每个 prompt 结尾必须包含）
Maintain face and clothing consistency. Sharp clarity. Cinematic texture. Natural colors. Soft lighting. No blur. No ghosting. Stable picture.

### 过渡片段
- 当相邻场景的地点、时间或情绪发生重大变化时，插入一个 4-6 秒的过渡片段
- 过渡片段标记 "isTransition": true, "beatType": "breath"
- 过渡 prompt 应描述：环境切换、时间流逝、或情绪转换的视觉元素
- 不需要为每对场景都加过渡，只在有明显跳跃时添加

### 同一场景内的连续性
- 同一场景的多个片段必须保持相同的环境描述、光线、角色服装
- 后续片段应描述动作的延续，不要重复前一个片段已描述的内容
- **景别渐进规则**：同一场景中，随着张力升级，景别应逐步收紧（全景→中景→特写）
- **相邻景别跳跃**：相邻片段的景别变化至少跳两级（全景→特写 ✓，全景→中全景 ✗）

重要：只输出纯 JSON，不要添加 markdown 代码块标记、注释或任何其他文字。`
      : `You are a professional short-drama storyboard artist, expert in editing rhythm and narrative beats. Your task is to split script scenes into video segments with cinematic breathing rhythm.

## Core Tasks
1. **Analyze scene transitions**: Check if adjacent scenes need transition segments
2. **Assign beat types**: Decide each segment's role in the narrative rhythm
3. **Split into video segments**: Break scenes into segments with breathing rhythm
4. **Generate AI video prompts**: Each segment prompt must be optimized for Seedance video generation, including audio/SFX direction

## Editing Rhythm Principles (Breathing Feel)

### Beat Types (beatType)
Each segment must have a beat type that determines its duration, framing, and camera:
| beatType | Duration | Framing | Camera | Purpose |
|---|---|---|---|---|
| hook | 3-5s | Close-up/ECU | Quick push-in or whip | Opening attention grab |
| establish | 4-6s | Wide/medium-wide | Slow pan or static | Set the scene |
| confrontation | 6-10s | Medium to MCU | Slight handheld/shot-reverse | Conflict face-off |
| escalation | 8-12s | Alternating CU & medium | Progressive push-in | Rising tension |
| emotional_peak | 8-12s | Lingering close-up | Very slow dolly or static | Emotional climax |
| reaction | 3-5s | Close-up on face | Static | Emotional landing |
| reveal | 4-8s | Medium→close-up | Deliberate slow push-in | Twist/revelation |
| action | 4-8s | Medium to wide | Tracking movement | Physical action |
| breath | 4-6s | Wide/medium | Static or gentle drift | Breathing space |
| cliffhanger | 3-5s | Close-up | Static or very slow zoom | Suspense ending |

### Breathing Rhythm Rules (CRITICAL)
- **Shorten→Release**: During tense sequences, shot durations should progressively shorten (10→8→6→4s), then release with one longer shot (8-12s) — like inhale→exhale
- **Never use the same duration for 4+ consecutive segments** — audiences habituate
- **Every 15-20 seconds must have a narrative shift** — new info, emotional turn, or visual surprise
- **Climax = stillness**: Most powerful moments use the calmest camera. Save frenetic cutting for escalation, not the peak
- **Calm before storm**: Place one notably longer quiet shot (breath) immediately before a major conflict/reveal to amplify impact

### Scene Arc Structure
**3-segment scene (15-25s):**
1. Setup establish/hook (4-6s) → 2. Escalation (8-12s) → 3. Payoff reaction/reveal (4-6s)

**4-segment scene (25-40s):**
1. Hook (3-5s) → 2. Development confrontation (8-10s) → 3. Climax emotional_peak (8-12s) → 4. Cliffhanger (3-5s)

**5-segment scene (40-70s):**
1. Hook (3-5s) → 2. Establish (5-8s) → 3. Escalation (10-12s) → 4. Peak emotional_peak (8-12s) → 5. Breath→Cliffhanger (5-8s)

## Duration Rules
- Segments with dialogue: **10-12 seconds** — ensure dialogue plays completely
- Action/emotion segments (no dialogue): **8-10 seconds**
- Pure environment/transition shots: **4-6 seconds**
- Each line of dialogue needs roughly 2-3 seconds
- **Always err on the longer side** — truncated dialogue is worse than extra silence

## Output Format (JSON)
{
  "segments": [
    {
      "segmentIndex": 0,
      "sceneNum": 1,
      "beatType": "hook|establish|confrontation|escalation|emotional_peak|reaction|reveal|action|breath|cliffhanger",
      "durationSec": 10,
      "isTransition": false,
      "prompt": "Detailed visual description... [AUDIO: sound/music direction]",
      "shotType": "wide|medium|close-up|extreme-close-up|full",
      "cameraMove": "static|pan-left|pan-right|tilt-up|tilt-down|dolly-in|dolly-out|tracking|orbit|push-in"
    }
  ]
}

## Prompt Writing Rules (Seedance Optimized)

### Structure Formula
Subject + Action + Scene/Environment + Lighting + Camera Movement + Style + Audio Direction + Quality Constraints

### Key Rules
- Each prompt: 30-120 English words
- ONE primary action per segment — never stack multiple actions
- Always name characters explicitly (matching script character names exactly)
- Describe specific visuals: clothing, expression, lighting direction, environment details
- Use professional camera terms: dolly in, push in slowly, pan left gently, orbit, tracking shot
- Always use "slow" and "gentle" — avoid "fast" or "exaggerated"
- **Dialogue**: Include character lines wrapped in double quotes, e.g.: The man turns to the woman and says: "Remember, never point at the moon."

### Audio/SFX Direction (append [AUDIO: ...] at end of each prompt)
Seedance generates dialogue voiceover and sound effects from the prompt. Add audio direction hints:
- **Dialogue**: Character lines in double quotes are auto-voiced by Seedance
- **Emotional atmosphere**: [AUDIO: Soft piano melody, gentle wind ambient, emotional strings swell]
- **Impact moments**: [AUDIO: Dramatic impact hit, silence before reveal, tension building bass drone]
- **Action**: [AUDIO: Rapid footsteps, cloth rustling, intense percussive rhythm]
- **Quiet/breath**: [AUDIO: Quiet ambient sounds, distant birds, soft breeze, minimal music]
- **Suspense/ending**: [AUDIO: Suspenseful low drone, sudden silence, heartbeat rhythm fading]

### Consistency Constraints (MUST append to every prompt)
Maintain face and clothing consistency. Sharp clarity. Cinematic texture. Natural colors. Soft lighting. No blur. No ghosting. Stable picture.

### Transition Segments
- When adjacent scenes have major changes in location, time, or mood, insert a 4-6 second transition
- Mark transitions with "isTransition": true, "beatType": "breath"
- Transition prompts should describe: environment change, passage of time, or mood shift
- Only add when there's a noticeable narrative gap

### Within-Scene Continuity
- Multiple segments from same scene MUST maintain identical environment, lighting, character clothing
- Subsequent segments should describe action continuation, not repeat previous descriptions
- **Progressive framing**: As tension builds, framing should progressively tighten (wide→medium→close-up)
- **Shot scale jumps**: Adjacent segments should change framing by at least two steps (wide→close-up ✓, wide→medium-wide ✗)

IMPORTANT: Output ONLY the raw JSON object. No markdown code blocks, no comments, no other text.`

    const userPrompt = lang === "zh"
      ? `请将以下剧本拆分为视频片段（包含必要的过渡段）：

剧名：${script.title}
类型：${script.genre || "drama"}
第 ${episodeNum} 集

角色信息：
${characterInfo}

场景地点：
${locationInfo || "（未定义）"}

场景内容：
${sceneDescriptions}`
      : `Split this script into video segments (include transition segments where needed):

Title: ${script.title}
Genre: ${script.genre || "drama"}
Episode ${episodeNum}

Characters:
${characterInfo}

Locations:
${locationInfo || "(none defined)"}

Scenes:
${sceneDescriptions}`

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 8192,
      responseFormat: "json",
    })

    const parsed = extractJSON<{ segments?: Array<Record<string, unknown>> }>(result.content)

    const segments = (parsed.segments || []).map((seg, i) => ({
      segmentIndex: (seg.segmentIndex as number) ?? i,
      sceneNum: (seg.sceneNum as number) ?? 1,
      // Allow up to 12s (Seedance max). Default 10s for dialogue-friendly pacing.
      // Seedance 1.5 Pro will use auto-duration (-1) at submission time, so this
      // serves as the billing estimate and timeline planning value.
      durationSec: Math.min(Math.max((seg.durationSec as number) ?? 10, 4), 12),
      prompt: (seg.prompt as string) || "",
      shotType: (seg.shotType as string) || "medium",
      cameraMove: (seg.cameraMove as string) || "static",
      beatType: (seg.beatType as string) || "establish",
      isTransition: (seg.isTransition as boolean) ?? false,
    }))

    return NextResponse.json({
      segments,
      model: result.model,
      defaultVideoModel: model || "seedance_2_0",
      defaultResolution: resolution || "720p",
    })
  } catch (error) {
    console.error("Split error:", error)
    return NextResponse.json({ error: "Split failed" }, { status: 500 })
  }
}
