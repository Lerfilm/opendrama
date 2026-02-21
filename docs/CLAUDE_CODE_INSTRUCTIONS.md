# OpenDrama 升级开发指令

> **给 Claude Code 的执行文档**  
> 技术栈: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Supabase + Prisma ORM + NextAuth v5 + Stripe  
> 核心原则: **Mobile-First**, 所有页面优先适配手机竖屏  
> 部署: Vercel Pro

---

## 项目概述

OpenDrama 是一个 UGC AI短剧创作平台。用户在 **Studio** 创作剧本 → 在 **Theater** 用 AI 生成视频 → 发布到 **Discover** 被其他用户观看、评分。

本次升级新增 4 大模块：
1. **Studio（创作平台）** — 剧本生成/编辑/AI润色
2. **Theater（影院）** — 视频生成（一键生成 + 精细调整）
3. **Token System（金币系统）** — Stripe 充值 + 按量扣费
4. **Discover（发现页）** — 发布/推荐/互动

---

## 执行顺序

严格按以下顺序开发，每完成一步确认无误再进入下一步：

### Phase 0: 数据库 Schema + 金币系统

#### 0.1 Prisma Schema

在 `prisma/schema.prisma` 中新增以下模型（保留现有模型不动）：

```prisma
// ========== 剧本相关 ==========

model Drama {
  id          String   @id @default(cuid())
  userId      String
  title       String
  genre       String?
  synopsis    String?  @db.Text
  coverImage  String?
  status      String   @default("draft") // draft | ready | producing | published
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  episodes    Episode[]
  characters  Character[]
  published   PublishedDrama?

  @@index([userId])
  @@index([status])
}

model Episode {
  id            String   @id @default(cuid())
  dramaId       String
  episodeNumber Int
  title         String?
  durationSec   Int?     // 目标时长，≤120
  status        String   @default("draft") // draft | scripted | filmed | edited
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  drama         Drama     @relation(fields: [dramaId], references: [id], onDelete: Cascade)
  scenes        Scene[]
  segments      VideoSegment[]

  @@unique([dramaId, episodeNumber])
  @@index([dramaId])
}

model Scene {
  id          String   @id @default(cuid())
  episodeId   String
  sceneNumber Int
  description String?  @db.Text
  dialogue    String?  @db.Text
  mood        String?
  location    String?
  timeOfDay   String?
  promptHint  String?  @db.Text  // 给视频生成的镜头提示
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  episode     Episode  @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@unique([episodeId, sceneNumber])
  @@index([episodeId])
}

model Character {
  id              String   @id @default(cuid())
  dramaId         String
  name            String
  description     String?  @db.Text
  referenceImages String[] // URL数组
  voiceProfile    String?  // 预留
  createdAt       DateTime @default(now())

  drama           Drama    @relation(fields: [dramaId], references: [id], onDelete: Cascade)

  @@index([dramaId])
}

// ========== 视频生成相关 ==========

model VideoSegment {
  id              String    @id @default(cuid())
  episodeId       String
  segmentIndex    Int       // 片段序号 0-based
  durationSec     Int       @default(15)
  prompt          String    @db.Text
  shotType        String?   // wide | medium | close-up | extreme-close-up
  cameraMove      String?   // static | pan | tilt | dolly | tracking | orbit
  referenceImages String[]
  referenceVideo  String?
  
  // 生成参数
  model           String?   // seedance_2.0 | seedance_1.5_pro | jimeng_3.0_pro | jimeng_3.0 | jimeng_s2_pro
  resolution      String?   // 1080p | 720p
  
  // 生成结果
  status          String    @default("pending") // pending | reserved | submitted | generating | done | failed
  providerTaskId  String?
  videoUrl        String?
  thumbnailUrl    String?
  tokenCost       Int?
  apiCostCents    Int?
  errorMessage    String?
  
  createdAt       DateTime  @default(now())
  completedAt     DateTime?

  episode         Episode   @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@unique([episodeId, segmentIndex])
  @@index([episodeId])
  @@index([status])
}

// ========== 金币系统 ==========

model UserBalance {
  id             String @id @default(cuid())
  userId         String @unique
  balance        Int    @default(0)     // 当前可用余额（金币）
  reserved       Int    @default(0)     // 预扣冻结
  totalPurchased Int    @default(0)     // 累计充值
  totalConsumed  Int    @default(0)     // 累计消耗
  
  user           User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model TokenTransaction {
  id          String   @id @default(cuid())
  userId      String
  type        String   // purchase | consume | refund | reserve | release | bonus
  amount      Int      // 正数=增加，负数=减少
  balanceAfter Int
  description String?
  metadata    Json?    // {model, resolution, segmentId, episodeId, stripePaymentId, ...}
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([type])
}

// ========== 发布 & 社区 ==========

model PublishedDrama {
  id              String    @id @default(cuid())
  dramaId         String    @unique
  userId          String
  status          String    @default("published") // published | featured | unlisted
  publishedAt     DateTime  @default(now())
  viewCount       Int       @default(0)
  likeCount       Int       @default(0)
  commentCount    Int       @default(0)
  ratingSum       Int       @default(0)
  ratingCount     Int       @default(0)
  recommendScore  Float     @default(0)
  tags            String[]
  featuredAt      DateTime?

  drama           Drama         @relation(fields: [dramaId], references: [id], onDelete: Cascade)
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  interactions    Interaction[]
  comments        Comment[]

  @@index([userId])
  @@index([status, recommendScore])
  @@index([publishedAt])
}

model Interaction {
  id               String   @id @default(cuid())
  userId           String
  publishedDramaId String
  action           String   // view | like | rate | bookmark | share
  value            Int?     // 评分值 1-5
  createdAt        DateTime @default(now())

  user             User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  publishedDrama   PublishedDrama @relation(fields: [publishedDramaId], references: [id], onDelete: Cascade)

  @@unique([userId, publishedDramaId, action])
  @@index([publishedDramaId, action])
}

model Comment {
  id               String    @id @default(cuid())
  userId           String
  publishedDramaId String
  episodeId        String?
  parentId         String?
  content          String    @db.Text
  likeCount        Int       @default(0)
  createdAt        DateTime  @default(now())

  user             User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  publishedDrama   PublishedDrama @relation(fields: [publishedDramaId], references: [id], onDelete: Cascade)
  parent           Comment?       @relation("CommentReplies", fields: [parentId], references: [id])
  replies          Comment[]      @relation("CommentReplies")

  @@index([publishedDramaId, createdAt])
  @@index([parentId])
}
```

**注意**: 在 `User` 模型中添加反向关系：
```prisma
// 在现有 User 模型中添加:
dramas          Drama[]
balance         UserBalance?
transactions    TokenTransaction[]
publishedDramas PublishedDrama[]
interactions    Interaction[]
comments        Comment[]
```

运行 `npx prisma migrate dev --name add_drama_theater_tokens_discover`

#### 0.2 金币服务层

创建 `src/lib/tokens.ts`:

```typescript
import { prisma } from "@/lib/prisma";

// 模型定价表（API成本/秒，单位：分）
export const MODEL_PRICING: Record<string, Record<string, number>> = {
  seedance_2_0:     { "1080p": 80, "720p": 40 },
  seedance_1_5_pro: { "1080p": 100, "720p": 50 },
  jimeng_3_0_pro:   { "1080p": 100 },
  jimeng_3_0:       { "1080p": 63, "720p": 28 },
  jimeng_s2_pro:    { "720p": 65 },
};

// 用户价格 = API成本 × 2，换算为金币（1金币=1元=100分）
export function calculateTokenCost(model: string, resolution: string, durationSec: number): number {
  const costPerSec = MODEL_PRICING[model]?.[resolution];
  if (!costPerSec) throw new Error(`Unknown model/resolution: ${model}/${resolution}`);
  const apiCostCents = costPerSec * durationSec;
  const userCostCents = apiCostCents * 2;
  return Math.ceil(userCostCents / 100); // 转为金币（向上取整）
}

// 预扣金币（生成前调用）
export async function reserveTokens(userId: string, amount: number): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    const balance = await tx.userBalance.findUnique({ where: { userId } });
    if (!balance || balance.balance - balance.reserved < amount) return false;
    
    await tx.userBalance.update({
      where: { userId },
      data: { reserved: { increment: amount } },
    });
    
    await tx.tokenTransaction.create({
      data: {
        userId, type: "reserve", amount: -amount,
        balanceAfter: balance.balance,
        description: `预扣 ${amount} 金币`,
      },
    });
    return true;
  });
}

// 确认扣费（生成成功后调用）
export async function confirmDeduction(userId: string, amount: number, metadata?: Record<string, unknown>): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.userBalance.update({
      where: { userId },
      data: {
        balance: { decrement: amount },
        reserved: { decrement: amount },
        totalConsumed: { increment: amount },
      },
    });
    
    await tx.tokenTransaction.create({
      data: {
        userId, type: "consume", amount: -amount,
        balanceAfter: balance.balance,
        description: `消耗 ${amount} 金币`,
        metadata: metadata as any,
      },
    });
  });
}

// 退还预扣（生成失败后调用）
export async function refundReservation(userId: string, amount: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.userBalance.update({
      where: { userId },
      data: { reserved: { decrement: amount } },
    });
    
    await tx.tokenTransaction.create({
      data: {
        userId, type: "release", amount,
        balanceAfter: balance.balance,
        description: `释放预扣 ${amount} 金币`,
      },
    });
  });
}

// 充值（Stripe webhook 调用）
export async function addTokens(userId: string, amount: number, stripePaymentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.userBalance.upsert({
      where: { userId },
      create: { userId, balance: amount, totalPurchased: amount },
      update: {
        balance: { increment: amount },
        totalPurchased: { increment: amount },
      },
    });
    
    await tx.tokenTransaction.create({
      data: {
        userId, type: "purchase", amount,
        balanceAfter: balance.balance,
        description: `充值 ${amount} 金币`,
        metadata: { stripePaymentId },
      },
    });
  });
}
```

#### 0.3 Stripe 充值 API

创建 `src/app/api/tokens/checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PACKAGES = [
  { id: "starter",  name: "入门包", price: 3000,  tokens: 30,  bonus: 0 },
  { id: "standard", name: "标准包", price: 9800,  tokens: 100, bonus: 2 },
  { id: "creator",  name: "创作包", price: 29800, tokens: 320, bonus: 22 },
  { id: "pro",      name: "专业包", price: 69800, tokens: 780, bonus: 82 },
] as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = await req.json();
  const pkg = PACKAGES.find((p) => p.id === packageId);
  if (!pkg) return NextResponse.json({ error: "Invalid package" }, { status: 400 });

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card", "alipay", "wechat_pay"],
    line_items: [
      {
        price_data: {
          currency: "cny",
          product_data: { name: `OpenDrama ${pkg.name} - ${pkg.tokens + pkg.bonus} 金币` },
          unit_amount: pkg.price,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
      packageId: pkg.id,
      tokens: String(pkg.tokens + pkg.bonus),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?canceled=true`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
```

创建 `src/app/api/webhooks/stripe/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { addTokens } from "@/lib/tokens";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const tokens = parseInt(session.metadata?.tokens || "0");
    
    if (userId && tokens > 0) {
      await addTokens(userId, tokens, session.payment_intent as string);
    }
  }

  return NextResponse.json({ received: true });
}
```

#### 0.4 金币余额 API

创建 `src/app/api/tokens/balance/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const balance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({
    balance: balance?.balance ?? 0,
    reserved: balance?.reserved ?? 0,
    available: (balance?.balance ?? 0) - (balance?.reserved ?? 0),
  });
}
```

---

### Phase 1: Studio — 剧本创作平台

#### 1.1 页面路由

```
src/app/(main)/studio/page.tsx          — 剧本列表（我的剧本）
src/app/(main)/studio/new/page.tsx      — 新建剧本（AI生成入口）
src/app/(main)/studio/[dramaId]/page.tsx — 剧本编辑器（场景卡片列表）
```

#### 1.2 剧本列表页 `/studio`

- 显示用户所有剧本，按更新时间倒序
- 每个剧本卡片显示：标题、集数、状态标签、封面
- 右下角 FAB 按钮「+ 新建剧本」
- Mobile-first: 单列卡片列表，Desktop 2列网格

#### 1.3 新建剧本页 `/studio/new`

UI 流程:
1. 输入区域: 题材/关键词文本框 + 风格选择（下拉: 都市、悬疑、科幻、古风、喜剧、恐怖、爱情）
2. 集数滑块: 1-24集，默认12集
3. 按钮「✨ AI 生成剧本」
4. AI 返回后显示: 剧名、简介、每集概要列表
5. 用户可修改剧名/简介，确认后「保存并开始编辑」→ 跳转到编辑页

**AI 生成 API**: `POST /api/scripts/generate`
- 输入: `{ genre, keywords, episodeCount }`
- 调用 LLM（使用项目现有的 AI 配置）生成剧本大纲
- System prompt 要求: 每集≤2分钟叙事量，输出 JSON 格式 `{ title, synopsis, episodes: [{ title, scenes: [{ description, dialogue, mood, location }] }] }`
- 返回生成结果，前端展示后用户确认保存

#### 1.4 剧本编辑器 `/studio/[dramaId]`

**核心 UI — 场景卡片列表（Mobile-First）:**

- 顶部: 剧本标题（可编辑）+ 保存按钮
- Episode Tab 切换栏: 水平滚动的集数选择 `[第1集] [第2集] [第3集] ...`
- 场景卡片列表（可展开/收起）:
  - 收起状态: 场景号 + 地点 + 首行描述（截断）
  - 展开状态: 全部字段可编辑（描述、对白、情绪、地点、时段）
  - 长按拖拽排序（使用 `@dnd-kit/sortable`）
- 底部浮动操作栏:
  - `✨ AI润色` — 选中场景后调用 AI 优化描述和对白
  - `💡 AI建议` — 分析当前集，给出节奏/镜头/情绪建议
  - `▶️ 去生成` — 跳转到 Theater（携带 dramaId + episodeNumber）
- `+ 添加场景` 按钮在列表底部

**AI 润色 API**: `POST /api/ai/polish`
- 输入: `{ sceneId }` 或 `{ episodeId }`（批量润色整集）
- 返回: 润色后的文本，前端以 diff 视图展示（原文 vs 润色），用户选择「采纳」或「放弃」

**AI 建议 API**: `POST /api/ai/suggest`
- 输入: `{ episodeId }`
- 返回: JSON `{ suggestions: [{ type: "pacing"|"camera"|"emotion"|"dialogue", message, sceneNumber? }] }`
- 前端以卡片列表展示建议，可一键应用

#### 1.5 角色管理

在剧本编辑页增加「角色」Tab:
- 角色列表: 名字 + 描述 + 参考图缩略图
- 添加/编辑角色: 名字、描述文本框、上传参考图（多张）
- 参考图上传到 Supabase Storage `reference-images/{dramaId}/{characterId}/`
- 这些参考图后续在 Theater 生成视频时自动附带

---

### Phase 2: Theater — 视频生成

#### 2.1 页面路由

```
src/app/(main)/theater/page.tsx                          — Theater 入口（选择剧本）
src/app/(main)/theater/[dramaId]/[episodeNum]/page.tsx   — 生成工作台
```

#### 2.2 Theater 入口页 `/theater`

- 列出用户所有状态为 `ready` 或 `producing` 的剧本
- 每个剧本展示: 标题 + 集数进度条（已生成/总集数）
- 点击进入 → 选择集数 → 选择生成模式

**集数选择 UI:**
- 网格按钮: 每集一个格子，显示状态图标
  - ✅ 已生成
  - ⏳ 生成中
  - 🔲 待生成
- 点击待生成的集数 → 进入生成模式选择

**生成模式选择:**
两张大卡片垂直排列:
- ⚡ **一键生成**: "AI 自动拆分 + 批量生成全部片段" + 预估金币
- 🎛️ **精细调整**: "逐个片段编辑 Prompt 和参考素材"

#### 2.3 角色形象选择 — 跨集一致性

**核心机制：每部剧的角色有固定参考图，生成每个视频片段时自动附带相关角色的参考图，确保跨集一致。**

##### 角色形象管理 UI

在 Theater 工作台顶部增加「🎭 演员」面板（可展开/收起）：

```
┌──────────────────────────┐
│  🎭 演员阵容  [编辑]       │
├──────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐    │
│ │头像 │ │头像 │ │头像 │    │
│ │小雨 │ │阿明 │ │老张 │    │
│ │3张参│ │2张参│ │1张参│    │
│ └────┘ └────┘ └────┘    │
│         [+ 添加角色]      │
└──────────────────────────┘
```

点击角色 → 弹出角色详情 Sheet：
- 角色名
- 角色描述（外貌、服装、特征）
- 参考图列表（支持多张，最多5张）
  - 📷 上传自己的图片
  - ✨ AI 生成角色形象（调用即梦 4.0，根据描述生成）
- 「设为主参考图」标记（生成视频时优先使用）

##### 角色形象 AI 生成

用户也可以不上传照片，而是用 AI 生成角色形象：

```
输入角色描述 → 即梦 4.0 生成多张角色正面/侧面参考图 → 用户选择满意的
```

API: `POST /api/characters/generate-image`
```typescript
// Body: { characterId, description }
// 调用即梦 4.0:
// {
//   "req_key": "jimeng_t2i_v40",
//   "prompt": "一个25岁中国女孩，短发，穿白色连衣裙，清新气质，正面半身照，白色背景，高清人像摄影风格",
//   "width": 2048,
//   "height": 2048,
//   "force_single": false  // 生成多张供选择
// }
```

##### 跨集一致性 — 自动注入参考图

**关键逻辑：生成视频片段时，自动根据场景中出现的角色，将其参考图注入到 API 请求中。**

在 `src/lib/video-generation.ts` 中：

```typescript
// 为视频片段自动附加角色参考图
export async function enrichSegmentWithCharacters(
  segmentId: string
): Promise<{ prompt: string; imageUrls: string[] }> {
  const segment = await prisma.videoSegment.findUnique({
    where: { id: segmentId },
    include: {
      episode: {
        include: {
          scenes: true,
          drama: { include: { characters: true } },
        },
      },
    },
  });
  if (!segment) throw new Error("Segment not found");

  const characters = segment.episode.drama.characters;
  
  // 从 prompt 中识别出现的角色（简单匹配角色名）
  const mentionedChars = characters.filter(
    (c) => segment.prompt.includes(c.name)
  );
  
  // 收集参考图（每个角色取主参考图，最多3张角色图）
  const charImageUrls = mentionedChars
    .flatMap((c) => c.referenceImages.slice(0, 2)) // 每角色最多2张
    .slice(0, 6); // 总共最多6张参考图
  
  // 增强 prompt：在开头加入角色描述
  const charDescriptions = mentionedChars
    .map((c) => `[角色${c.name}：${c.description || ""}]`)
    .join(" ");
  const enhancedPrompt = charDescriptions
    ? `${charDescriptions}\n${segment.prompt}`
    : segment.prompt;
  
  // 合并用户上传的参考图 + 角色参考图
  const allImageUrls = [...(segment.referenceImages || []), ...charImageUrls];
  
  return { prompt: enhancedPrompt, imageUrls: allImageUrls };
}
```

##### 不同 API 的参考图传递方式

| API | 参考图传递 | 一致性策略 |
|---|---|---|
| **Seedance 1.5 Pro / 2.0** | 多模态 @ 引用，image_url 参数 | 每个片段附带角色参考图，prompt 中用 @角色名 引用 |
| **即梦 I2V（图生视频）** | `image_urls` 数组 | 用角色参考图作为首帧输入 |
| **即梦 T2V（文生视频）** | 仅 prompt | prompt 中详细描述角色外貌特征 |

**Seedance 系列效果最好**——原生支持多模态参考，能精准保持角色外貌一致。即梦系列主要靠 prompt 描述 + 图生视频的首帧参考。

##### 场景-角色关联

在 Scene 模型中已有 `characters` 概念。镜头拆分时（Phase 2 的 `/api/ai/split`），LLM 需要在每个 segment 的 prompt 中**明确提及该片段出现的角色名**，这样 `enrichSegmentWithCharacters` 就能自动匹配。

拆分 LLM 的 System Prompt 中增加指令：
```
在每个片段的 prompt 中，必须明确写出该片段中出现的角色名字（与剧本中定义的角色名完全一致），
以便系统自动匹配角色参考图，保持角色形象跨片段一致。
```

---

#### 2.4 一键生成流程

URL: `/theater/[dramaId]/[episodeNum]?mode=auto`

步骤:
1. **配置面板** — 选模型 + 分辨率 + 风格（可选预设）
2. 点击「⚡ 开始一键生成」
3. 后端流程:
   a. 调用 `POST /api/ai/split` 将剧本拆分为15秒片段（LLM生成每段 prompt）
   b. 计算总金币消耗，前端显示确认对话框
   c. 用户确认后，批量创建 `VideoSegment` 记录
   d. 逐个调用视频生成 API
4. **进度面板** — 实时显示每个片段状态（使用 Supabase Realtime 或轮询）
5. 全部完成 → 自动播放拼接预览
6. 底部: 「保存草稿」「切换到精细调整」

**镜头拆分 API**: `POST /api/ai/split`
- 输入: `{ episodeId, model, resolution }`
- LLM System Prompt: 将剧本场景拆分为多个≤15秒视频片段，每个片段输出:
  ```json
  {
    "segments": [
      {
        "segmentIndex": 0,
        "durationSec": 15,
        "prompt": "全景：夕阳西下的城市天台，一个女孩背对镜头站在栏杆旁，风吹起她的长发。镜头缓缓推近至中景...",
        "shotType": "wide",
        "cameraMove": "dolly_in"
      }
    ]
  }
  ```
- Prompt 要遵循即梦/Seedance 的最佳实践: 明确运镜、明确动作逻辑、匹配镜头编号

#### 2.5 精细调整模式

URL: `/theater/[dramaId]/[episodeNum]?mode=manual`

UI 布局（Mobile-First）:
- 顶部: 视频预览播放器（16:9，满宽）
- 中部: 水平滚动时间线（片段缩略图 + 状态图标）
- 下部: 当前选中片段的编辑面板
  - 模型下拉选择
  - 分辨率下拉选择
  - Prompt 文本编辑区
  - 镜头类型选择: 全景/中景/近景/特写
  - 运镜方式选择: 固定/平移/推拉/跟拍/环绕
  - 参考图上传区
  - 参考视频上传区
  - 片段时长: 5s / 10s / 15s 选择
- 底部: 「🎬 生成此片段 🪙XX」按钮

#### 2.5 视频生成服务

创建 `src/lib/video-generation.ts`:

```typescript
// 统一的视频生成接口
export interface VideoGenerationRequest {
  model: string;
  resolution: string;
  prompt: string;
  imageUrls?: string[];
  referenceVideo?: string;
  aspectRatio?: string;
  durationSec: number;
}

export interface VideoGenerationResult {
  taskId: string;
  status: "submitted" | "generating" | "done" | "failed";
  videoUrl?: string;
  error?: string;
}

// 提交视频生成任务
export async function submitVideoTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  // 根据 model 路由到不同的 API
  if (req.model.startsWith("seedance")) {
    return submitSeedanceTask(req);
  } else {
    return submitJimengTask(req);
  }
}

// 查询任务状态
export async function queryVideoTask(model: string, taskId: string): Promise<VideoGenerationResult> {
  if (model.startsWith("seedance")) {
    return querySeedanceTask(taskId);
  } else {
    return queryJimengTask(taskId);
  }
}

// ====== Seedance（火山方舟 SDK）======
// 需要安装: npm install @volcengine/openapi

async function submitSeedanceTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  // TODO: Seedance 1.5 Pro 接入
  // 使用火山方舟 SDK，endpoint 参考 /docs/82379/1366799
  // model_id: seedance-1-5-pro（确认后填入）
  // 支持: text_prompt, image_url, reference_video_url
  throw new Error("Seedance integration pending - use Jimeng as fallback");
}

async function querySeedanceTask(taskId: string): Promise<VideoGenerationResult> {
  throw new Error("Seedance integration pending");
}

// ====== 即梦系列（火山视觉 REST API）======
// 鉴权: Region=cn-north-1, Service=cv
// 需要火山引擎 VOLC_ACCESSKEY 和 VOLC_SECRETKEY

const JIMENG_REQ_KEYS: Record<string, string> = {
  jimeng_3_0_pro: "jimeng_vgfm_t2v_l20", // 文生视频用 t2v，图生视频用 i2v
  jimeng_3_0: "jimeng_vgfm_t2v_l20",
  jimeng_s2_pro: "jimeng_vgfm_t2v_l20",
};

async function submitJimengTask(req: VideoGenerationRequest): Promise<{ taskId: string }> {
  const reqKey = JIMENG_REQ_KEYS[req.model];
  if (!reqKey) throw new Error(`Unknown Jimeng model: ${req.model}`);

  // 火山视觉 API 调用
  // POST https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31
  // Body: { req_key, prompt, aspect_ratio, image_urls?, seed: -1 }
  // Header: 需要 HMAC-SHA256 签名鉴权
  
  // 使用 @volcengine/openapi SDK 进行签名
  // 返回 { code: 10000, data: { task_id: "xxx" } }
  
  // TODO: 实现火山引擎 API 签名和调用
  throw new Error("Jimeng integration - implement volcengine API signing");
}

async function queryJimengTask(taskId: string): Promise<VideoGenerationResult> {
  // POST https://visual.volcengineapi.com?Action=CVSync2AsyncGetResult&Version=2022-08-31
  // Body: { req_key, task_id }
  // 返回: { code: 10000, data: { status: "done", video_url: "..." } }
  throw new Error("Jimeng query - implement volcengine API signing");
}
```

**重要**: 火山引擎 API 签名鉴权参考:
- npm 包: `@volcengine/openapi`
- Region: `cn-north-1`, Service: `cv`
- 需要环境变量: `VOLC_ACCESSKEY`, `VOLC_SECRETKEY`

#### 2.6 视频生成 API Routes

创建 `src/app/api/video/submit/route.ts`:
- 输入: `{ segmentId }` 或 `{ episodeId }` (批量)
- 流程: 预扣金币 → 调用 submitVideoTask → 创建轮询任务
- 返回: `{ taskId, estimatedWaitSec }`

创建 `src/app/api/video/status/route.ts`:
- 输入: `{ segmentId }` 或 `{ episodeId }`
- 返回: 每个片段的当前状态

创建 `src/app/api/video/poll/route.ts` (内部 cron 或客户端轮询):
- 检查所有 `status=submitted|generating` 的任务
- 调用 queryVideoTask 更新状态
- 成功: 确认扣费 + 保存 videoUrl
- 失败: 退还金币 + 记录错误

---

### Phase 2.5: 自动生成封面海报

每集视频生成完成后（或用户手动触发），自动为该集生成封面海报图。使用即梦 4.0 图像生成 API (`jimeng_t2i_v40`)。

#### 2.5.1 封面生成逻辑

```
视频全部片段生成完成
     ↓
自动触发封面生成（也可手动重新生成）
     ↓
LLM 根据剧本内容生成封面 prompt
     ↓
调用即梦 4.0 API 生成 2K 封面图
     ↓
保存到 Supabase Storage + 写入 Episode.coverImage
```

#### 2.5.2 两种封面款式

| 款式 | 比例 | 分辨率 | 用途 |
|---|---|---|---|
| **宽版** (Wide) | 16:9 | 2560×1440 | 首页 Banner、Discover 卡片、桌面端展示 |
| **窄版** (Tall) | 3:4 | 2496×3328 | 手机端卡片、作品详情页、分享海报 |

每集自动生成**两张**封面，一宽一窄。

#### 2.5.3 Prisma Schema 补充

在 `Episode` 模型中添加字段：

```prisma
model Episode {
  // ... 现有字段 ...
  coverWide       String?   // 宽版封面 URL (16:9)
  coverTall       String?   // 窄版封面 URL (3:4)
  coverPrompt     String?   @db.Text  // 生成封面用的 prompt
  coverTaskIdWide String?   // 宽版即梦任务 ID
  coverTaskIdTall String?   // 窄版即梦任务 ID
  coverStatus     String?   @default("pending") // pending | generating | done | failed
}
```

`Drama` 模型增加两个封面字段：
```prisma
model Drama {
  // ... 现有字段 ...
  coverWide     String?  // 宽版剧封面（默认取第1集）
  coverTall     String?  // 窄版剧封面（默认取第1集）
}
```

前端根据场景自动选用：
- 手机端列表/卡片 → `coverTall`
- 桌面端横向卡片/Banner → `coverWide`
- 响应式: `<picture>` 或 Tailwind `hidden sm:block` 切换

#### 2.5.3 封面生成服务

在 `src/lib/cover-generation.ts` 中：

```typescript
import { prisma } from "@/lib/prisma";

// 调用 LLM 为剧集生成封面 prompt
export async function generateCoverPrompt(episodeId: string): Promise<string> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { scenes: true, drama: { include: { characters: true } } },
  });
  if (!episode) throw new Error("Episode not found");

  const sceneSummary = episode.scenes
    .map((s) => `场景${s.sceneNumber}: ${s.location || ""} - ${s.description?.slice(0, 100)}`)
    .join("\n");
  const characterNames = episode.drama.characters.map((c) => c.name).join("、");

  // 调用 LLM 生成封面 prompt
  // System prompt 要求：根据剧集内容，生成一张电影海报风格的封面图描述
  // 输出要求：适合即梦 4.0 的 prompt，800字符以内，包含画面构图、色调、风格描述
  // 不要包含文字（AI生图文字效果差）
  
  const systemPrompt = `你是一个专业的电影海报设计师。根据以下剧集信息，生成一段AI图像生成prompt。
要求：
- 电影海报风格，有视觉冲击力
- 描述画面构图、主要人物姿态、场景氛围、光影色调
- 不要在画面中包含任何文字
- 中文描述，800字符以内
- 竖版构图（3:4比例）适合手机展示`;

  const userPrompt = `剧名：${episode.drama.title}
第${episode.episodeNumber}集：${episode.title || ""}
角色：${characterNames}
场景：
${sceneSummary}`;

  // 调用项目现有的 LLM API 获取 prompt
  // return llmResponse.text;
  return ""; // TODO: 接入 LLM
}

// 调用即梦 4.0 生成封面图（宽版 + 窄版各一张）
export async function submitCoverGeneration(
  episodeId: string, 
  prompt: string
): Promise<{ wideTaskId: string; tallTaskId: string }> {
  // 宽版 16:9
  // POST https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31
  // Body: { "req_key": "jimeng_t2i_v40", "prompt": prompt, "width": 2560, "height": 1440, "force_single": true }
  
  // 窄版 3:4
  // Body: { "req_key": "jimeng_t2i_v40", "prompt": prompt, "width": 2496, "height": 3328, "force_single": true }
  
  // 两个请求并行提交
  // 返回两个 task_id
  return { wideTaskId: "", tallTaskId: "" }; // TODO: 实现火山视觉 API 调用
}

// 查询封面生成结果
export async function queryCoverResult(taskId: string): Promise<{ imageUrl?: string; status: string }> {
  // POST https://visual.volcengineapi.com?Action=CVSync2AsyncGetResult&Version=2022-08-31
  // Body:
  // {
  //   "req_key": "jimeng_t2i_v40",
  //   "task_id": taskId,
  //   "req_json": "{\"return_url\":true}"
  // }
  // 返回 image_urls 数组（有效期24小时，需要下载保存到 Supabase Storage）
  
  return { status: "pending" }; // TODO: 实现
}
```

#### 2.5.4 封面生成 API Routes

创建 `src/app/api/cover/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateCoverPrompt, submitCoverGeneration } from "@/lib/cover-generation";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { episodeId } = await req.json();

  // 生成 prompt
  const prompt = await generateCoverPrompt(episodeId);
  
  // 提交即梦 4.0 生图任务（宽版 + 窄版并行）
  const { wideTaskId, tallTaskId } = await submitCoverGeneration(episodeId, prompt);
  
  // 更新状态
  await prisma.episode.update({
    where: { id: episodeId },
    data: { 
      coverPrompt: prompt, 
      coverTaskIdWide: wideTaskId,
      coverTaskIdTall: tallTaskId,
      coverStatus: "generating" 
    },
  });

  return NextResponse.json({ wideTaskId, tallTaskId, prompt });
}
```

创建 `src/app/api/cover/status/route.ts` — 查询封面生成状态，成功后下载图片到 Supabase Storage。

#### 2.5.5 自动触发时机

在视频生成全部完成的回调中，自动触发封面生成：

```typescript
// 在 video poll/完成回调中:
const allDone = segments.every(s => s.status === "done");
if (allDone) {
  // 自动生成封面
  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode?.coverImage) {
    await fetch("/api/cover/generate", {
      method: "POST",
      body: JSON.stringify({ episodeId }),
    });
  }
  
  // 如果是第一集，同时设为剧封面
  if (episode?.episodeNumber === 1) {
    // 封面生成完成后，复制到 Drama.coverImage
  }
}
```

#### 2.5.6 封面 UI

在 Theater 工作台和「我的作品」中显示封面：
- 自动生成后显示缩略图
- 「🔄 重新生成封面」按钮（可编辑 prompt 后重新生成）
- 封面生成**免费**（不消耗金币，作为平台增值服务，降低门槛）

#### 2.5.7 封面成本说明

即梦 4.0 图像生成按张计费（约 ¥0.04/张 2K），每集 2 张（宽+窄）≈ ¥0.08，成本极低，平台承担，不向用户收费。

---

### Phase 3: Discover — 发布 & 社区

#### 3.1 页面路由

```
src/app/(main)/discover/page.tsx              — 发现页（热门/好评/最新）
src/app/(main)/discover/[publishedId]/page.tsx — 作品详情 + 播放
src/app/(main)/my-works/page.tsx              — 我的作品（草稿/已发布）
```

#### 3.2 发布流程

在 Theater 完成生成后，增加「保存草稿」和「发布」按钮:
- **保存草稿**: Drama status → `producing`, 可继续编辑
- **发布**: 
  1. 检查所有片段均已生成（status=done）
  2. 创建 `PublishedDrama` 记录
  3. Drama status → `published`
  4. 出现在 Discover 页面

#### 3.3 Discover 发现页

**Mobile-First UI:**
- 顶部搜索栏
- Tab 切换: 🔥热门 | ⭐好评 | 🆕最新 | 🏷️分类
- 2列网格卡片:
  - 封面图（16:9缩略图）
  - 标题
  - 评分 + 播放量
  - 作者头像 + 名字
- 无限滚动加载

**排序逻辑:**
- 热门: `ORDER BY recommendScore DESC`
- 好评: `WHERE ratingCount >= 10 ORDER BY (ratingSum/ratingCount) DESC`
- 最新: `ORDER BY publishedAt DESC`

#### 3.4 作品详情页

- 顶部: 视频播放器（Mux Player，竖屏9:16优先）
- 集数选择栏（水平滚动）
- 作品信息: 标题、简介、标签、作者
- 互动栏: ❤️点赞 | ⭐评分(1-5星) | 🔖收藏 | 📤分享
- 评论区: 最新评论列表 + 输入框

#### 3.5 首页推荐

修改首页 `/` (或 `/home`):
- Banner 轮播: 编辑精选（从 `featured` 状态的作品中选取）
- 「🔥 热门推荐」横向滚动卡片
- 「🆕 新鲜出炉」竖向列表
- 推荐分数通过定时任务（Vercel Cron 或后台 API）每小时计算更新

**推荐分计算 API**: `POST /api/cron/update-scores`（Vercel Cron 调用）
```typescript
score = (viewCount + avgRating * ratingCount * 10 + likeCount * 2 + commentCount * 3) 
        / pow(hoursSincePublish + 2, 1.8)
```

---

### Phase 3.5: Card Collection — 成就卡系统

用户每成功发布一部剧，获得一张**成就卡**（Achievement Card）。成就卡就是该剧的竖屏海报（窄版封面 3:4），以精美卡牌形式展示在「我的收藏」中。

#### 3.5.1 成就卡数据模型

```prisma
model AchievementCard {
  id              String    @id @default(cuid())
  userId          String
  publishedDramaId String   @unique  // 每部剧只有一张成就卡
  cardImage       String    // 卡面图片 URL（即剧的窄版封面 coverTall）
  rarity          String    @default("common") // common | rare | epic | legendary
  title           String    // 剧名
  subtitle        String?   // 副标题（如 "首部作品" "10集大作"）
  earnedAt        DateTime  @default(now())
  viewCount       Int       @default(0)  // 被浏览次数（别人看你的卡册）

  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  publishedDrama  PublishedDrama @relation(fields: [publishedDramaId], references: [id], onDelete: Cascade)

  @@index([userId, earnedAt])
}
```

在 User 模型中添加: `achievementCards AchievementCard[]`
在 PublishedDrama 模型中添加: `achievementCard AchievementCard?`

#### 3.5.2 卡牌稀有度

根据剧的数据自动判定稀有度：

```typescript
function determineRarity(drama: PublishedDrama, userCardCount: number): string {
  // 传奇 — 评分≥4.8 且 播放量≥10000
  if (drama.avgRating >= 4.8 && drama.viewCount >= 10000) return "legendary";
  // 史诗 — 评分≥4.5 且 播放量≥3000
  if (drama.avgRating >= 4.5 && drama.viewCount >= 3000) return "epic";
  // 稀有 — 评分≥4.0 或 播放量≥1000
  if (drama.avgRating >= 4.0 || drama.viewCount >= 1000) return "rare";
  // 普通
  return "common";
}
```

**注意**: 稀有度会随数据变化**动态升级**（定时任务检查）。升级时也触发获得动画。

卡牌边框样式：

| 稀有度 | 边框 | 特效 |
|---|---|---|
| Common | 银色细边 | 无 |
| Rare | 蓝色渐变边框 | 微光闪烁 |
| Epic | 紫色渐变边框 | 粒子环绕 |
| Legendary | 金色渐变边框 | 全息彩虹光效 |

#### 3.5.3 获得动画（Achievement Animation）

发布成功后，全屏弹出成就卡获得动画，要**非常精美**：

**动画分3阶段（总时长约3秒）：**

**阶段1 — 光芒汇聚（0-1s）：**
- 屏幕中央出现一个光点
- 粒子从四周向中心汇聚
- 背景变暗（半透明黑色遮罩）
- 伴随升调音效

**阶段2 — 卡牌揭示（1-2s）：**
- 卡牌从光芒中旋转飞出（Y轴3D翻转）
- 根据稀有度显示不同的光效爆发：
  - Common: 白色柔光
  - Rare: 蓝色光束
  - Epic: 紫色闪电 + 粒子爆发
  - Legendary: 金色冲击波 + 全息彩虹 + 粒子雨
- 卡面显示竖版海报 + 剧名 + 稀有度标签

**阶段3 — 展示停留（2-3s）：**
- 卡牌居中展示，轻微浮动呼吸动画
- 稀有度边框持续特效
- 底部文字淡入："🎉 新成就卡！" + 剧名
- 点击任意位置或「收入卡册」按钮关闭

**实现方式**: 使用 CSS Animations + Framer Motion

创建 `src/components/achievement-animation.tsx`:

```typescript
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface AchievementAnimationProps {
  show: boolean;
  card: {
    cardImage: string;
    title: string;
    rarity: "common" | "rare" | "epic" | "legendary";
  };
  onClose: () => void;
}

const RARITY_STYLES = {
  common: {
    border: "border-gray-300",
    glow: "shadow-[0_0_30px_rgba(200,200,200,0.5)]",
    label: "普通",
    labelBg: "bg-gray-500",
    particles: "from-gray-200 to-white",
  },
  rare: {
    border: "border-blue-400",
    glow: "shadow-[0_0_40px_rgba(59,130,246,0.6)]",
    label: "稀有",
    labelBg: "bg-blue-500",
    particles: "from-blue-300 to-cyan-200",
  },
  epic: {
    border: "border-purple-500",
    glow: "shadow-[0_0_50px_rgba(168,85,247,0.7)]",
    label: "史诗",
    labelBg: "bg-purple-600",
    particles: "from-purple-400 to-pink-300",
  },
  legendary: {
    border: "border-yellow-400",
    glow: "shadow-[0_0_60px_rgba(250,204,21,0.8)]",
    label: "传奇",
    labelBg: "bg-gradient-to-r from-yellow-500 to-amber-500",
    particles: "from-yellow-300 to-orange-200",
  },
};

export function AchievementAnimation({ show, card, onClose }: AchievementAnimationProps) {
  const style = RARITY_STYLES[card.rarity];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* 背景暗化 */}
          <motion.div
            className="absolute inset-0 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />

          {/* 光芒汇聚粒子效果 — 用多个 motion.div 圆点从四周飞向中心 */}
          {/* TODO: 实现 20-30 个粒子动画，使用随机起始位置和延迟 */}

          {/* 卡牌主体 */}
          <motion.div
            className="relative z-10"
            initial={{ scale: 0, rotateY: 180 }}
            animate={{ scale: 1, rotateY: 0 }}
            transition={{
              delay: 0.8,
              duration: 0.8,
              type: "spring",
              stiffness: 200,
              damping: 15,
            }}
          >
            {/* 卡牌 */}
            <div className={`relative w-[280px] rounded-2xl overflow-hidden border-4 ${style.border} ${style.glow}`}>
              {/* 封面图 */}
              <img src={card.cardImage} alt={card.title} className="w-full aspect-[3/4] object-cover" />
              
              {/* 底部信息条 */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <h3 className="text-white font-bold text-lg">{card.title}</h3>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white mt-1 ${style.labelBg}`}>
                  {style.label}
                </span>
              </div>

              {/* 稀有度边框动画光效 — CSS animation 环绕光线 */}
              {card.rarity !== "common" && (
                <div className="absolute inset-0 pointer-events-none rounded-2xl animate-shimmer" />
              )}
            </div>

            {/* 底部文字 */}
            <motion.p
              className="text-center text-white text-lg font-bold mt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.8 }}
            >
              🎉 新成就卡！
            </motion.p>
            <motion.p
              className="text-center text-white/60 text-sm mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.0 }}
            >
              点击任意位置收入卡册
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**需要的 CSS 动画**（加入 `globals.css`）:

```css
@keyframes shimmer {
  0% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0); }
  50% { box-shadow: inset 0 0 20px 2px rgba(255,255,255,0.3); }
  100% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0); }
}
.animate-shimmer { animation: shimmer 2s ease-in-out infinite; }

/* Legendary 全息彩虹效果 */
@keyframes holographic {
  0% { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
```

额外依赖:
```bash
npm install framer-motion
```

#### 3.5.4 卡册页面（Card Collection）

创建 `src/app/(main)/collection/page.tsx`:

**手机端 UI:**

```
┌──────────────────────────┐
│  🃏 我的卡册  (12张)       │
├──────────────────────────┤
│  [全部] [传奇2] [史诗3] [稀有4] │
├──────────────────────────┤
│  ┌─────────┬─────────┐   │
│  │ 竖版海报  │ 竖版海报  │   │
│  │ 金框✨    │ 紫框     │   │
│  │ 城市黄昏  │ 末日信号  │   │
│  │ ⭐传奇    │ ⭐史诗    │   │
│  ├─────────┼─────────┤   │
│  │ 竖版海报  │ 竖版海报  │   │
│  │ 蓝框     │ 银框     │   │
│  │ 深海秘境  │ 星际快递  │   │
│  │ ⭐稀有    │ ⭐普通    │   │
│  └─────────┴─────────┘   │
├──────────────────────────┤
│  首页  创作  🎬影院  发现  │
└──────────────────────────┘
```

- 2列网格，每张卡用竖版海报 (coverTall) + 稀有度边框
- 点击卡牌 → 全屏展示（复用成就动画的卡牌展示部分，但无粒子效果）
- 卡牌可以长按分享（生成带稀有度边框的分享图）
- 他人主页也能看到卡册（公开展示）

#### 3.5.5 触发时机

在发布成功的回调中触发：

```typescript
// 在 publish API 中:
async function onPublishSuccess(publishedDramaId: string, userId: string) {
  const published = await prisma.publishedDrama.findUnique({
    where: { id: publishedDramaId },
    include: { drama: true },
  });
  if (!published) return;

  // 创建成就卡
  const rarity = determineRarity(published, await getUserCardCount(userId));
  
  await prisma.achievementCard.create({
    data: {
      userId,
      publishedDramaId,
      cardImage: published.drama.coverTall || published.drama.coverWide || "",
      rarity,
      title: published.drama.title,
      subtitle: getAchievementSubtitle(published, rarity),
    },
  });

  // 前端收到响应后弹出获得动画
  return { newCard: true, rarity };
}

function getAchievementSubtitle(drama: any, rarity: string): string {
  // 根据情况返回成就副标题
  // "首部作品"（用户第一张卡）
  // "10集大作"（10集以上）
  // "口碑之作"（评分≥4.5）
  // etc.
  return "";
}
```

---

### Phase 4: 底部导航 + 全局布局

#### 4.1 Mobile 底部 Tab 导航

创建 `src/components/bottom-nav.tsx`:

```
首页(Home) | 创作(Studio) | 🎬影院(Theater) | 发现(Discover) | 我的(Profile)

「我的」页面中包含入口: 🃏 我的卡册(Card Collection) | 📝 我的作品 | 💰 金币余额 | ⚙️ 设置
```

- 使用 shadcn/ui 样式
- 当前页高亮
- 影院 Tab 使用特殊样式（强调色）
- Desktop: 隐藏底部导航，使用顶部侧边栏

#### 4.2 Layout

```
src/app/(main)/layout.tsx — 包含底部导航的主布局
```

确保所有页面内容区域底部有 `pb-20` 为底部导航留空间。

---

## 环境变量

在 `.env.local` 中需要:

```env
# 现有配置保持不变...

# 火山引擎（即梦视频生成 + Seedance）
VOLC_ACCESSKEY=xxx
VOLC_SECRETKEY=xxx

# Stripe（金币充值）
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx
```

---

## UI 组件清单

使用 shadcn/ui CLI 安装以下组件（如未安装）:

```bash
npx shadcn@latest add button card dialog dropdown-menu input label select separator sheet slider tabs textarea toast badge avatar scroll-area progress
```

额外依赖:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install @volcengine/openapi
npm install stripe @stripe/stripe-js
npm install framer-motion
```

---

## 关键约束

1. **Mobile-First**: 所有页面先设计320px宽度，再扩展到桌面。使用 Tailwind 的 `sm:` `md:` `lg:` 断点向上适配。
2. **中文优先**: 所有 UI 文案中文，后续再加 i18n。
3. **金币定价**: 严格按 `API成本 × 2` 计算，使用 `MODEL_PRICING` 配置表。
4. **生成失败必退币**: 任何视频生成失败都要退还预扣金币。
5. **视频URL有效期**: 火山引擎返回的视频URL只有1小时有效期，生成成功后需要立即下载保存到 Supabase Storage 或其他永久存储。
6. **15秒片段**: 默认片段时长15秒，精细调整模式可选 5s/10s/15s。
7. **不要删除现有代码**: 在现有项目基础上增量开发，保留所有现有功能。

---

## 开始执行

从 Phase 0 开始，逐步实现。每完成一个 Phase，运行 `npm run build` 确认无报错，再进入下一个 Phase。

如果遇到火山引擎 API 签名问题，先用 mock 数据跑通整个流程，标记 `// TODO: real API call` 待后续填入。
