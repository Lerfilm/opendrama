# OpenDrama 系统升级技术计划书

> **版本**: v1.1  
> **日期**: 2026-02-21  
> **作者**: Nancy（创意总监）  
> **核心原则**: Mobile-First · AI-Powered · Token Economy

---

## 一、产品架构总览

```
┌─────────────────────────────────────────────────────┐
│                    OpenDrama App                     │
│                  (Mobile-First UI)                   │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│   📝 创作平台         │   🎬 Theater     │  🌍 Discover   │
│   Studio             │   影院            │  发现 & 首页    │
│                      │                  │                │
│  · 剧本生成/编辑      │  · 15秒片段拆分   │ · 发布/草稿管理 │
│  · AI 润色 & 建议     │  · 多模型视频生成  │ · 热门/好评/最新│
│  · 剧集管理（≤2min）  │  · 多分辨率选择   │ · 评分/评论/点赞│
│  · 保存至「我的剧本」  │  · 片段剪辑预览   │ · 推荐算法排序  │
│                      │  · 金币消耗×2     │ · 创作者关注    │
├──────────────────────┴──────────────────────────────┤
│                  💰 Token/金币系统                    │
│          Stripe 充值 · 按量扣费 · 成本×2 定价         │
├─────────────────────────────────────────────────────┤
│                  🔧 后端服务层                        │
│     Next.js API Routes · Supabase · Prisma          │
├─────────────────────────────────────────────────────┤
│                  🤖 AI 服务层                        │
│  LLM (剧本)  ·  Seedance 2.0  ·  即梦 S2.0/4.0     │
└─────────────────────────────────────────────────────┘
```

---

## 二、模块详细设计

### 模块 A：创作平台（Studio）

#### A1. 剧本生成器

**用户流程（手机端）：**

```
选择题材/风格 → AI生成剧本大纲 → 用户确认/修改
     ↓
拆分为剧集（每集≤2分钟） → 每集自动拆分场景
     ↓
AI润色 & 建议 → 用户编辑 → 保存至「我的剧本」
```

**功能清单：**

| 功能 | 描述 | 消耗金币 |
|---|---|---|
| 一键生成剧本 | 输入题材/关键词，AI生成完整剧本大纲 | 少量（LLM调用） |
| 剧集拆分 | 自动将剧本拆为多集，每集≤2分钟 | 免费 |
| AI 润色 | 优化对白、场景描述、情感表达 | 少量（LLM调用） |
| AI 建议 | 智能提示：节奏建议、镜头语言、情绪曲线 | 少量（LLM调用） |
| 手动编辑 | 富文本编辑器，支持场景/对白/旁白标记 | 免费 |
| 版本管理 | 剧本修改历史，可回滚 | 免费 |

**手机端 UI 设计要点：**

- 底部 Tab 导航：`首页` | `创作` | `影院` | `我的`
- 剧本编辑采用卡片式场景列表，上下滑动
- 每个场景卡片可展开编辑，收起显示摘要
- AI 润色/建议通过底部浮动按钮触发，结果以 diff 高亮展示
- 长按场景卡片可拖拽排序

```
┌──────────────────────────┐
│  ← 我的新剧本    💾 保存  │
├──────────────────────────┤
│  第1集 · 城市黄昏 (1:45)  │
│ ┌──────────────────────┐ │
│ │ 场景1: 天台           │ │
│ │ "夕阳照在她脸上..."   │ │
│ │ 📎 角色: 小雨, 阿明    │ │
│ │            [展开编辑]  │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 场景2: 咖啡馆         │ │
│ │ "两人相对而坐..."     │ │
│ │            [展开编辑]  │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ + 添加场景             │ │
│ └──────────────────────┘ │
├──────────────────────────┤
│  ✨AI润色  💡AI建议  ▶️生成视频 │
├──────────────────────────┤
│  首页  创作  🎬影院  我的  │
└──────────────────────────┘
```

#### A2. 我的剧本（Library）

**数据模型：**

```
Drama（剧）
  ├── title, genre, synopsis, coverImage
  ├── status: draft | ready | producing | published
  ├── episodes: Episode[]
  │     ├── episodeNumber, title, duration (≤120s)
  │     ├── scenes: Scene[]
  │     │     ├── sceneNumber, description, dialogue
  │     │     ├── characters: Character[]
  │     │     ├── mood, location, timeOfDay
  │     │     └── promptHint（给视频生成的镜头提示）
  │     └── status: draft | scripted | filmed | edited
  └── characters: Character[]
        ├── name, description, referenceImages[]
        └── voiceProfile（预留：配音风格）
```

---

### 模块 B：Theater（影院 / 视频制作）

#### B1. 镜头拆分引擎

**核心逻辑：将每集（≤2分钟）自动拆分为多个 ≤15秒 的 Prompt 片段**

```
1集剧本（≤120秒）
     ↓  AI自动拆分
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ 片段1│ 片段2│ 片段3│ 片段4│ 片段5│ 片段6│ 片段7│ 片段8│
│ 15s │ 15s │ 15s │ 15s │ 15s │ 15s │ 15s │ 15s │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
     ↓  每个片段生成
· 视频 Prompt（镜头描述 + 运镜 + 情绪）
· 参考图提示（角色、场景风格）
· 音频提示（音效、BGM 描述）
```

**拆分规则：**

- 按场景边界优先拆分
- 单场景超过15秒则按动作节拍细分
- 每个片段包含：prompt、镜头类型（全景/中景/特写）、运镜方式
- LLM 生成拆分方案，用户可手动调整

#### B2. Theater 入口 — 从剧本草稿进入

**Theater 读取 Studio 保存的剧本草稿，用户选择剧集后进入生成：**

```
┌──────────────────────────┐
│  🎬 Theater               │
├──────────────────────────┤
│  选择剧本：               │
│ ┌──────────────────────┐ │
│ │ 🎬 城市黄昏  12集      │ │
│ │ 第1-4集已生成 · 5-12待生│ │
│ │              [进入 →]  │ │
│ ├──────────────────────┤ │
│ │ 🎬 深海秘境  6集       │ │
│ │ 全部待生成             │ │
│ │              [进入 →]  │ │
│ └──────────────────────┘ │
├──────────────────────────┤
│  选择集数：               │
│  [01✅] [02✅] [03⏳] [04] │
│  [05] [06] [07] [08]     │
├──────────────────────────┤
│  生成模式：               │
│ ┌──────────────────────┐ │
│ │ ⚡ 一键生成             │ │
│ │ AI自动拆分+批量生成全部  │ │
│ │ 快速省心，适合初稿       │ │
│ │         🪙 192 预估     │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 🎛️ 精细调整             │ │
│ │ 逐个片段编辑prompt/参考  │ │
│ │ 精准控制，适合精修       │ │
│ │         🪙 按片段计费    │ │
│ └──────────────────────┘ │
├──────────────────────────┤
│  首页  创作  🎬影院  我的  │
└──────────────────────────┘
```

#### B3. ⚡ 一键生成模式

**全自动流程，用户只需选模型和分辨率：**

```
用户选择剧集 → 选模型/分辨率 → 确认金币消耗
     ↓
AI 自动拆分为15秒片段（LLM生成每段prompt）
     ↓
自动为每段匹配：镜头类型、运镜、角色参考
     ↓
批量提交全部片段生成
     ↓
进度面板实时更新（1/8, 2/8 ...）
     ↓
全部完成 → 自动拼接预览 → 保存草稿
```

**一键生成 UI：**

```
┌──────────────────────────┐
│  ← 一键生成·第3集         │
├──────────────────────────┤
│  模型: [Seedance 2.0  ▾] │
│  分辨率: [1080p ▾]        │
│  风格: [电影质感 ▾]       │
├──────────────────────────┤
│  📊 预估                  │
│  片段数: 8 × 15秒         │
│  总时长: 2:00             │
│  总消耗: 🪙 192           │
│  预计耗时: ~10分钟         │
├──────────────────────────┤
│  [⚡ 开始一键生成 🪙192]   │
├──────────────────────────┤
│  ┌──────────────────────┐│
│  │ 生成进度 3/8  ████░░░ ││
│  │ 片段1 ✅ 片段2 ✅       ││
│  │ 片段3 ⏳生成中...       ││
│  │ 片段4-8 🔲 等待中       ││
│  └──────────────────────┘│
├──────────────────────────┤
│  完成后可切换至「精细调整」  │
│  对不满意的片段单独重新生成  │
└──────────────────────────┘
```

#### B4. 🎛️ 精细调整模式

**逐片段控制，支持从一键生成结果进入精修：**

```
┌──────────────────────────┐
│  ← 精细调整·第3集  ⚙️设置  │
├──────────────────────────┤
│  ┌─────────────────────┐ │
│  │    ▶️ 预览播放器      │ │
│  │   [当前选中片段预览]   │ │
│  └─────────────────────┘ │
├──────────────────────────┤
│  时间线 ←→ 可滑动         │
│ ┌────┬────┬────┬────┬──┐ │
│ │ 01 │ 02 │ 03 │ 04 │..│ │
│ │ ✅ │ ✅ │ ✅ │ 🔲 │  │ │
│ │15s │15s │15s │15s │  │ │
│ └────┴────┴────┴────┴──┘ │
├──────────────────────────┤
│ 片段 03 / 8              │
│ ┌──────────────────────┐ │
│ │ 模型: [Seedance 2.0 ▾] │ │
│ │ 分辨率: [1080p ▾]      │ │
│ ├──────────────────────┤ │
│ │ Prompt:               │ │
│ │ "中景：小雨推开咖啡馆  │ │
│ │  的门，镜头跟随她从门  │ │
│ │  外推入室内..."        │ │
│ │              [✏️编辑]  │ │
│ ├──────────────────────┤ │
│ │ 参考图: [+上传] 📷     │ │
│ │ 参考视频: [+上传] 🎥   │ │
│ ├──────────────────────┤ │
│ │ 镜头: [中景▾] 运镜: [跟拍▾]│ │
│ └──────────────────────┘ │
├──────────────────────────┤
│ [🎬 生成此片段 🪙24]      │
│ [🔄 重新生成（不满意）🪙24] │
├──────────────────────────┤
│  首页  创作  🎬影院  我的  │
└──────────────────────────┘
```

**精细调整特有功能：**

| 功能 | 描述 |
|---|---|
| 单片段模型切换 | 每个片段可选不同模型/分辨率 |
| Prompt 手动编辑 | 完全自定义镜头描述 |
| 参考素材上传 | 每片段独立上传参考图/视频 |
| 镜头参数 | 手动选择镜头类型、运镜方式 |
| A/B 对比 | 同一片段生成多个版本，对比选择 |
| 重新生成 | 不满意可重新生成（再次消耗金币） |
| 片段时长微调 | 5s / 10s / 15s 可选 |

**两种模式的切换：**

```
一键生成（快速出初稿）
     ↓ 不满意某些片段？
切换至精细调整 → 只重新生成需要修改的片段
     ↓ 满意
保存至草稿 → 发布
```

#### B5. 模型 & 分辨率选择

**模型分层：**

| 层级 | 模型 | 接入方式 | 状态 | 特色 |
|---|---|---|---|---|
| 🌟 旗舰 | Seedance 2.0 | 火山方舟 SDK | ⏳ 预计2/24开放 | 音视频联合、多镜头叙事 |
| ⭐ 推荐 | Seedance 1.5 Pro | 火山方舟 SDK | ✅ 已可用 | 音视频联合、高质量 |
| 💎 高端 | 即梦 3.0 Pro | 火山视觉 API | ✅ 已可用 | 最高画质 |
| 🔷 标准 | 即梦 3.0 | 火山视觉 API | ✅ 已可用 | 性价比高 |
| 🔹 经济 | 即梦 S2.0 Pro | 火山视觉 API | ✅ 已可用 | 成本最低之一 |

**可选模型及定价（API 成本 × 2）：**

| 模型 | 分辨率 | API 成本/秒 | 用户价格/秒 | 15秒片段金币 | 接入平台 |
|---|---|---|---|---|---|
| Seedance 2.0 | 1080p | ~¥0.80 | ¥1.60 | 🪙24 | 火山方舟（待开放）|
| Seedance 2.0 | 720p | ~¥0.40 | ¥0.80 | 🪙12 | 火山方舟（待开放）|
| Seedance 1.5 Pro | 1080p | ~¥1.00 | ¥2.00 | 🪙30 | 火山方舟 ✅ |
| Seedance 1.5 Pro | 720p | ~¥0.50 | ¥1.00 | 🪙15 | 火山方舟 ✅ |
| 即梦 3.0 Pro | 1080p | ¥1.00 | ¥2.00 | 🪙30 | 火山视觉 ✅ |
| 即梦 3.0 | 1080p | ¥0.63 | ¥1.26 | 🪙19 | 火山视觉 ✅ |
| 即梦 3.0 | 720p | ¥0.28 | ¥0.56 | 🪙9 | 火山视觉 ✅ |
| 即梦 S2.0 Pro | 720p | ¥0.65 | ¥1.30 | 🪙20 | 火山视觉 ✅ |

> **注**: Seedance 1.5 Pro / 2.0 价格为预估，以火山方舟控制台实际为准  
> **定价公式**: `用户金币 = ceil(API单价 × 视频秒数 × 2 ÷ 金币单价)`  
> **金币汇率建议**: 1 金币 = ¥1.00（方便计算）

**Seedance 1.5 Pro vs 即梦系列的关键差异：**

| 能力 | Seedance 1.5 Pro | 即梦 S2.0/3.0 系列 |
|---|---|---|
| 原生音频生成 | ✅ 支持 | ❌ 不支持 |
| 音视频同步 | ✅ 原生同步 | ❌ 需后期配音 |
| 视频时长 | 5-10秒 | 固定5秒 |
| 多模态输入 | 文本+图片+视频 | 文本/图片 |
| 接入方式 | 火山方舟 SDK | 火山视觉 REST API |

**一集成本估算（2分钟 = 8个15秒片段）：**

| 模型 + 分辨率 | 单片段 | 一集（8片段） | 12集一季 |
|---|---|---|---|
| Seedance 2.0 1080p | 🪙24 | 🪙192 | 🪙2,304 |
| Seedance 1.5 Pro 1080p | 🪙30 | 🪙240 | 🪙2,880 |
| Seedance 1.5 Pro 720p | 🪙15 | 🪙120 | 🪙1,440 |
| 即梦 3.0 720p（最便宜） | 🪙9 | 🪙72 | 🪙864 |
| 即梦 3.0 Pro 1080p | 🪙30 | 🪙240 | 🪙2,880 |

**开发优先级（先可用，再升级）：**
1. ✅ **Phase 1**: 先接入 Seedance 1.5 Pro + 即梦系列（已可用）
2. ⏳ **Phase 2**: 2/24 后接入 Seedance 2.0（旗舰体验）

#### B6. 片段剪辑功能

**手机端轻量剪辑：**

- 裁剪：调整片段起止点
- 排序：拖拽调整片段顺序
- 重新生成：不满意可重新生成（再次消耗金币）
- 替换：可单独替换某个片段
- 预览：拼接所有片段顺序播放
- 导出：合并为完整剧集视频

---

### 模块 C：金币系统（Token Economy）

#### C1. 金币充值

```
Stripe Checkout → 金币到账 → Supabase user_balance 更新
```

| 充值包 | 金额 | 金币 | 赠送 |
|---|---|---|---|
| 入门包 | ¥30 | 🪙30 | — |
| 标准包 | ¥98 | 🪙100 | +2 |
| 创作包 | ¥298 | 🪙320 | +22 |
| 专业包 | ¥698 | 🪙780 | +82 |

#### C2. 扣费逻辑

```typescript
// 扣费流程
async function deductTokens(userId: string, task: VideoTask) {
  const apiCostPerSec = getModelPrice(task.model, task.resolution);
  const totalApiCost = apiCostPerSec * task.durationSec;
  const userCost = Math.ceil(totalApiCost * 2); // API成本 × 2
  
  // 预扣（生成前）
  await reserveTokens(userId, userCost);
  
  try {
    const result = await generateVideo(task);
    if (result.success) {
      await confirmDeduction(userId, userCost); // 确认扣费
    } else {
      await refundReservation(userId, userCost); // 失败退还
    }
  } catch (error) {
    await refundReservation(userId, userCost); // 异常退还
  }
}
```

**关键规则：**
- 生成前预扣金币，失败则退还
- 只有成功返回视频才最终扣费（与火山引擎计费一致）
- 用户可在生成前看到预估消耗
- 余额不足时提示充值

#### C3. 数据模型

```sql
-- 用户金币余额
CREATE TABLE user_balance (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  balance INT NOT NULL DEFAULT 0,        -- 当前余额
  reserved INT NOT NULL DEFAULT 0,       -- 预扣冻结
  total_purchased INT NOT NULL DEFAULT 0, -- 累计充值
  total_consumed INT NOT NULL DEFAULT 0   -- 累计消耗
);

-- 金币流水
CREATE TABLE token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL,  -- 'purchase' | 'consume' | 'refund' | 'reserve' | 'bonus'
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  description TEXT,
  metadata JSONB,             -- {model, resolution, taskId, episodeId, ...}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 视频生成任务
CREATE TABLE video_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  episode_id UUID NOT NULL,
  segment_index INT NOT NULL,       -- 片段序号
  model VARCHAR(50) NOT NULL,       -- 'seedance_2.0' | 'jimeng_s2pro' | ...
  resolution VARCHAR(20) NOT NULL,  -- '1080p' | '720p'
  duration_sec INT NOT NULL,        -- 视频秒数
  prompt TEXT NOT NULL,
  reference_images TEXT[],
  reference_video TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending|reserved|submitted|generating|done|failed
  provider_task_id VARCHAR(100),    -- 火山引擎 task_id
  video_url TEXT,                   -- 生成结果 URL
  token_cost INT,                   -- 实际金币消耗
  api_cost_cents INT,               -- 实际 API 成本（分）
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

### 模块 D：发布 & 社区发现（Discover）

#### D1. 发布流程

```
Theater 剧集生成完毕
     ↓
[保存至草稿] → 「我的作品」草稿箱
     ↓  用户确认发布
[内容审核] → 自动检测（敏感内容/版权）
     ↓  通过
[发布上线] → 出现在 Discover 页面
     ↓  积累数据
[推荐引擎] → 根据热度/评分推荐至首页
```

**作品状态流转：**

```
draft（草稿）→ review（审核中）→ published（已发布）→ featured（首页推荐）
                                  ↓
                              unlisted（下架）
```

#### D2. 我的作品管理

```
┌──────────────────────────┐
│  我的作品                  │
├──────────────────────────┤
│  [草稿 3] [已发布 5] [全部] │
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ 🎬 城市黄昏            │ │
│ │ 12集 · 草稿           │ │
│ │ 第8集生成中... ⏳       │ │
│ │ [继续编辑] [预览] [发布] │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 🎬 深海秘境            │ │
│ │ 6集 · 已发布 ✅        │ │
│ │ 👁 1.2k · ⭐ 4.6 · 💬 28│ │
│ │ [数据] [编辑] [下架]    │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

#### D3. Discover 发现页

**手机端 UI：**

```
┌──────────────────────────┐
│  🔍 搜索剧本...           │
├──────────────────────────┤
│  🔥热门  ⭐好评  🆕最新  🏷️分类 │
├──────────────────────────┤
│  ┌─────────┬─────────┐   │
│  │ 封面图    │ 封面图    │   │
│  │ 城市黄昏  │ 末日信号  │   │
│  │ ⭐4.8 👁3k│ ⭐4.5 👁2k│   │
│  ├─────────┼─────────┤   │
│  │ 封面图    │ 封面图    │   │
│  │ 深海秘境  │ 星际快递  │   │
│  │ ⭐4.6 👁1k│ ⭐4.3 👁800   │
│  └─────────┴─────────┘   │
├──────────────────────────┤
│  首页  创作  🎬影院  发现  │
└──────────────────────────┘
```

#### D4. 首页推荐算法

**推荐分数计算：**

```typescript
function calculateScore(drama: Drama): number {
  const hoursSincePublish = (Date.now() - drama.publishedAt) / 3600000;
  const gravity = 1.8; // 时间衰减因子
  
  // 热度分 = (播放量权重 + 好评权重 + 互动权重) / 时间衰减
  const viewScore = drama.viewCount * 1;
  const ratingScore = drama.avgRating * drama.ratingCount * 10;
  const engageScore = (drama.likeCount * 2 + drama.commentCount * 3);
  
  return (viewScore + ratingScore + engageScore) / Math.pow(hoursSincePublish + 2, gravity);
}
```

**推荐规则：**

| 位置 | 规则 | 刷新频率 |
|---|---|---|
| 首页 Banner | 编辑精选（人工/AI筛选） | 每日 |
| 首页「热门推荐」 | 推荐分 Top 20 | 每小时 |
| 首页「新鲜出炉」 | 最近24h发布，评分≥4.0 | 实时 |
| Discover 默认排序 | 综合推荐分 | 每小时 |
| Discover「好评榜」 | 评分排序（最低30条评价） | 每日 |

#### D5. 互动系统

| 功能 | 描述 |
|---|---|
| ⭐ 评分 | 1-5星，观看≥30秒后可评 |
| ❤️ 点赞 | 单集/整剧点赞 |
| 💬 评论 | 每集评论区，支持回复 |
| 🔖 收藏 | 加入「我的收藏」 |
| 📤 分享 | 生成分享链接/海报 |
| 🔔 关注 | 关注创作者，更新通知 |

#### D6. 数据模型补充

```sql
-- 已发布作品
CREATE TABLE published_dramas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drama_id UUID NOT NULL REFERENCES dramas(id),
  user_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'published', -- published | featured | unlisted
  published_at TIMESTAMPTZ DEFAULT NOW(),
  view_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  rating_sum INT DEFAULT 0,       -- 评分总和
  rating_count INT DEFAULT 0,     -- 评分人数
  avg_rating FLOAT GENERATED ALWAYS AS (
    CASE WHEN rating_count > 0 THEN rating_sum::float / rating_count ELSE 0 END
  ) STORED,
  recommend_score FLOAT DEFAULT 0, -- 定时计算
  tags TEXT[],
  featured_at TIMESTAMPTZ          -- 上首页时间
);

-- 用户互动
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_type VARCHAR(20) NOT NULL, -- 'drama' | 'episode'
  target_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,      -- 'view' | 'like' | 'rate' | 'bookmark' | 'share'
  value INT,                        -- 评分值（1-5）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, target_type, target_id, action)
);

-- 评论
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  episode_id UUID NOT NULL,
  parent_id UUID REFERENCES comments(id),
  content TEXT NOT NULL,
  like_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 三、技术架构

### 3.1 服务拓扑

```
[Mobile Browser / PWA]
         │
         ▼
[Vercel Edge / Next.js 15]
   ├── /app (React Server Components)
   │     ├── /studio     → 创作平台页面
   │     ├── /theater    → 影院/视频制作页面
   │     ├── /library    → 我的剧本
   │     └── /account    → 充值/余额
   │
   ├── /api (Route Handlers)
   │     ├── /api/scripts      → 剧本 CRUD + AI生成
   │     ├── /api/ai/polish    → AI润色
   │     ├── /api/ai/suggest   → AI建议
   │     ├── /api/ai/split     → 镜头拆分
   │     ├── /api/video/submit → 提交视频生成
   │     ├── /api/video/status → 查询生成状态
   │     ├── /api/tokens       → 金币余额/充值
   │     └── /api/webhooks     → Stripe webhook
   │
   ├── [Supabase]
   │     ├── PostgreSQL (Prisma ORM)
   │     ├── Auth (NextAuth v5)
   │     ├── Storage (参考图/视频)
   │     └── Realtime (生成状态推送)
   │
   └── [外部 AI 服务]
         ├── 火山方舟 SDK → Seedance 2.0
         ├── 火山视觉 API → 即梦 S2.0 / 3.0 / 4.0
         └── LLM API → 剧本生成/润色/拆分
```

### 3.2 视频生成异步流程

```
用户点击「生成」
     │
     ▼
[预扣金币] → 余额不足? → 提示充值
     │
     ▼
[创建 video_task: status=reserved]
     │
     ▼
[调用 AI API 提交任务]
     │  ├── Seedance 2.0: 火山方舟 SDK
     │  └── 即梦系列: 火山视觉 CVSync2AsyncSubmitTask
     │
     ▼
[获得 task_id, status=submitted]
     │
     ▼
[轮询/Webhook 查询结果]  ←──── Supabase Realtime 推送状态给前端
     │
     ├── 成功 → 确认扣费 → 保存 video_url → 通知用户
     └── 失败 → 退还金币 → 记录错误 → 允许重试
```

### 3.3 手机端适配要点

| 要点 | 实现方案 |
|---|---|
| 响应式布局 | Tailwind `sm:` / `md:` 断点，默认竖屏 |
| 触控交互 | 拖拽排序用 `@dnd-kit/sortable`，滑动用原生 CSS scroll-snap |
| 离线支持 | 剧本本地缓存（IndexedDB），恢复网络后同步 |
| 加载速度 | Next.js RSC + 流式渲染，骨架屏占位 |
| 视频预览 | Mux Player（自适应码率，移动端优化） |
| PWA | 支持添加到主屏幕，推送通知（生成完成） |

---

## 四、开发排期

| 阶段 | 内容 | 时间 | 依赖 |
|---|---|---|---|
| **P0** | 金币系统 + Stripe 充值 | 1 周 | — |
| **P1** | 创作平台 Studio（剧本编辑器 + AI润色/建议） | 2 周 | P0 |
| **P2** | 镜头拆分引擎 + 片段 Prompt 生成 | 1 周 | P1 |
| **P3** | Seedance 2.0 API 接入（2/24开放后） | 1 周 | API开放 |
| **P3b** | 即梦系列 API 接入（降级方案） | 3 天 | — |
| **P4** | Theater 视频生成工作台 UI | 2 周 | P2 + P3 |
| **P5** | 片段剪辑 + 拼接导出 | 1 周 | P4 |
| **P6** | 发布流程 + 草稿管理 + 审核 | 1 周 | P5 |
| **P7** | Discover 发现页 + 首页推荐算法 | 1.5 周 | P6 |
| **P8** | 互动系统（评分/评论/点赞/收藏/关注） | 1 周 | P7 |
| **P9** | 手机端优化 + PWA | 1 周 | P4 |
| **P10** | 测试 + 上线 | 1 周 | 全部 |
| | **总计** | **~12 周** | |

---

## 五、风险 & 应对

| 风险 | 影响 | 应对 |
|---|---|---|
| Seedance 2.0 API 延迟开放 | Theater 核心功能阻塞 | 先用即梦 S2.0 Pro 开发，Seedance 作为升级 |
| 视频生成延迟高（排队） | 用户体验差 | 后台队列 + 推送通知 + 进度条 |
| API 成本波动 | 利润受影响 | 动态定价表，可后台调整倍率 |
| 15秒片段间不连贯 | 短剧观感差 | Seedance 2.0 多镜头叙事能力 + 角色参考图 |
| 手机端剧本编辑体验 | 输入复杂 | AI 辅助为主，用户仅微调 |
| 内容审核不通过 | 生成失败 | 前置 prompt 检查 + 友好错误提示 + 退币 |

---

## 六、后续扩展（V2）

- 🎵 AI 配音：角色语音合成（TTS）
- 🎶 AI 配乐：根据场景自动生成背景音乐（Seedance 2.0 原生支持）
- 👥 协作创作：多人编辑同一剧本
- 🏪 素材市场：角色形象、场景模板交易
- 📊 创作者数据面板：播放/收入/粉丝分析
- 💰 创作者分成：热门作品可获金币奖励
- 🏆 排行榜：周榜/月榜/总榜

---

*文档位置: `docs/opendrama-upgrade-plan.md`*  
*下一步: 2月24日 Seedance 2.0 API 开放后，更新 P3 阶段的具体接入方案*
