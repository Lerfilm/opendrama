# OpenDrama - 全模块开发进度

## 架构概览

```
Next.js 16 + React 19 + Prisma 7 + Supabase (PostgreSQL) + Mux + Stripe
```

三大核心模块：观看端 | 创作端（编剧工坊）| 互动端（AI 剧场）

---

## 已完成功能

### 观看端 (Phase 1 MVP + 增强)
- [x] Google OAuth 登录
- [x] 首页推荐列表
- [x] 剧集详情 + Mux 视频播放
- [x] 金币经济 (Stripe 支付)
- [x] 集卡系统 (5 级稀有度)
- [x] 管理后台 CMS
- [x] 数据分析面板
- [x] i18n 中英双语
- [x] PWA + SEO
- [x] **发现页** - 搜索、分类标签、热门/最新排序、观看量统计
- [x] **Admin CRUD** - Series/Episode/Card 的编辑和删除 API

### 创作端 - 编剧工坊
- [x] 数据模型: Script, ScriptScene, ScriptRole, AIJob
- [x] 创作中心页 (/studio) - 快捷入口 + 剧本列表
- [x] 新建剧本表单 (/studio/script/new) - 类型/格式/集数/概要
- [x] 剧本编辑器 (/studio/script/[id]) - 场景/角色/AI 生成
- [x] 剧本 CRUD API (/api/scripts)
- [x] AI 剧本生成 API (/api/ai/generate-script) - 占位实现
- [x] **文生视频** (/studio/text-to-video) - 即梦风格 UI
  - 提示词输入 + 反向提示词
  - 风格选择 (自动/写实/动漫/3D/电影感)
  - 比例选择 (16:9, 9:16, 1:1, 4:3)
  - 时长选择 (3s, 5s, 10s)
  - 参考图上传 (UI 预留)
  - 生成历史 + 下载/重新生成
  - 文生视频 API (/api/ai/text-to-video) - Seed Dance 接口占位

### 互动端 - AI 剧场
- [x] 数据模型: Theater, TheaterSession, TheaterMessage, TheaterVoteOption, TheaterVote
- [x] 剧场列表页 (/theater) - 直播/暂停/结束状态显示
- [x] 创建剧场 (/theater/create) - 标题/剧情设定/AI 角色配置
- [x] 剧场直播页 (/theater/[id]) - 暗色主题
  - 角色头像横向列表
  - 对话气泡 (角色对话 + 旁白)
  - 投票选项 (百分比条 + 票数)
  - 底部弹幕输入
- [x] 投票 API (/api/theaters/[id]/vote) - 原子操作
- [x] 剧场 CRUD API (/api/theaters)

### 基础设施
- [x] 底部导航 5 标签: 首页 | 发现 | 创作 | 剧场 | 我的
- [x] i18n 70+ 新翻译 keys (中/英)
- [x] 8 个新 SVG 图标

---

## 新增数据模型 (共 10 个)

| 模型 | 表名 | 说明 |
|------|------|------|
| Script | scripts | AI 剧本 |
| ScriptScene | script_scenes | 剧本场景/分集 |
| ScriptRole | script_roles | 剧本角色 |
| AIJob | ai_jobs | AI 任务队列 |
| Theater | theaters | AI 剧场 |
| TheaterSession | theater_sessions | 剧场会话/幕 |
| TheaterMessage | theater_messages | 剧场消息 |
| TheaterVoteOption | theater_vote_options | 投票选项 |
| TheaterVote | theater_votes | 用户投票 |

---

## 新增 API 路由

| 路径 | 方法 | 说明 |
|------|------|------|
| /api/scripts | GET, POST | 剧本列表/创建 |
| /api/scripts/[id] | GET, PUT, DELETE | 剧本详情/更新/删除 |
| /api/ai/generate-script | POST | AI 生成剧本 |
| /api/ai/text-to-video | POST | 文生视频 |
| /api/theaters | GET, POST | 剧场列表/创建 |
| /api/theaters/[id]/vote | POST | 投票 |
| /api/admin/series/[id] | GET, PUT, DELETE | 系列详情/编辑/删除 |
| /api/admin/episodes | POST | 创建单集 |
| /api/admin/episodes/[id] | PUT, DELETE | 编辑/删除单集 |
| /api/admin/cards/[id] | PUT, DELETE | 编辑/删除卡片 |

---

## 新增页面路由

| 路径 | 说明 |
|------|------|
| /discover | 发现页 (搜索 + 分类 + 排行) |
| /studio | 创作中心 |
| /studio/script/new | 新建剧本 |
| /studio/script/[id] | 剧本编辑器 |
| /studio/text-to-video | 文生视频 (即梦风格) |
| /theater | AI 剧场列表 |
| /theater/create | 创建剧场 |
| /theater/[id] | 剧场直播/互动 |

---

## 待接入外部 API

1. **Volcengine Seed Dance** - 文生视频
   - 需要配置: `VOLCENGINE_AK`, `VOLCENGINE_SK`
   - 当前状态: API 占位，返回模拟结果

2. **LLM (OpenAI/Claude/Doubao)** - AI 剧本生成
   - 需要配置: `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY`
   - 当前状态: 占位，生成示例场景和角色

3. **WebSocket** - 剧场实时通信
   - 需要: 独立 WebSocket 服务器或使用 Supabase Realtime
   - 当前状态: 页面刷新获取最新数据

---

## 下一步

- [ ] 接入 Volcengine Seed Dance API (文生视频)
- [ ] 接入 LLM API (剧本生成)
- [ ] WebSocket 实时通信 (剧场互动)
- [ ] 金币套餐优化 ($0.99-$19.99 + 月卡)
- [ ] 创作者发布流程 (剧本 → 视频 → 上架)
- [ ] 剧场回放功能
