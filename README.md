# DramaBox 🎬 — 短剧视频平台

移动优先的竖屏短剧平台，支持视频播放、金币充值、剧集解锁和卡牌收集。

## ✨ 功能

- **Google OAuth 登录** — NextAuth v5 一键登录
- **竖屏视频播放** — Mux 视频流，进度保存
- **金币系统** — Stripe 充值，金币解锁付费剧集
- **卡牌收集** — 观看剧集随机掉落卡牌（5 种稀有度）
- **CMS 后台** — 管理员可管理剧集、卡牌、查看数据分析
- **数据分析** — 用户增长、观看数据、收入统计仪表盘
- **PWA 支持** — 添加到主屏幕
- **SEO 优化** — sitemap、robots.txt、元数据

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 数据库 | PostgreSQL (Supabase) |
| ORM | Prisma 7 |
| 认证 | NextAuth v5 (Google OAuth) |
| 支付 | Stripe Checkout |
| 视频 | Mux Video + Mux Player |
| 部署 | Vercel |

## 📁 项目结构

```
dramabox/
├── app/
│   ├── (main)/          # 用户端路由
│   │   ├── page.tsx     # 首页（推荐剧集）
│   │   ├── discover/    # 发现页
│   │   ├── series/[id]/ # 剧集详情
│   │   ├── episode/[id]/# 播放页
│   │   ├── recharge/    # 充值页
│   │   ├── purchases/   # 购买记录
│   │   ├── cards/       # 卡牌收集
│   │   └── profile/     # 个人中心
│   ├── (admin)/admin/   # CMS 后台
│   │   ├── series/      # 剧集管理
│   │   ├── cards/       # 卡牌管理
│   │   └── analytics/   # 数据分析
│   └── api/             # API 路由
│       ├── admin/       # 管理员 API
│       ├── stripe/      # 支付 webhook + checkout
│       ├── mux/         # 视频上传
│       └── watch/       # 观看事件
├── components/          # React 组件
├── lib/                 # 工具库（auth, prisma, stripe, mux, admin）
├── prisma/              # 数据库 schema + 迁移
└── scripts/             # 种子数据脚本
```

## 🚀 本地开发

### 前置条件

- Node.js 20+
- PostgreSQL（推荐 Supabase）
- Google Cloud Console 项目（OAuth）
- Stripe 账号
- Mux 账号

### 1. 克隆 & 安装

```bash
git clone <repo-url>
cd dramabox
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入实际值
```

### 3. 数据库初始化

```bash
npx prisma migrate dev
npx prisma generate
```

### 4. （可选）导入测试数据

```bash
npx tsx scripts/seed-test-data.ts
```

### 5. 启动开发服务器

```bash
npm run dev
# 访问 http://localhost:3000
```

### 6. Stripe Webhook 本地测试

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## ☁️ Vercel 部署

1. **导入项目** — 在 [vercel.com](https://vercel.com) 导入 GitHub 仓库
2. **配置环境变量** — 在 Settings → Environment Variables 中添加 `.env.example` 中列出的所有变量
3. **数据库** — 确保 `DATABASE_URL` 指向生产 Supabase 实例
4. **Prisma** — Vercel 构建时会自动运行 `prisma generate`（已在 postinstall 或 build 中配置）
5. **Stripe Webhook** — 在 Stripe Dashboard 添加生产 webhook endpoint: `https://your-domain.com/api/stripe/webhook`
6. **部署** — Push 到 main 分支自动部署

## 🔑 环境变量说明

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `AUTH_SECRET` | NextAuth 加密密钥 |
| `AUTH_TRUST_HOST` | 设为 `true`（Vercel 部署必需） |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `STRIPE_SECRET_KEY` | Stripe 密钥 |
| `STRIPE_PUBLISHABLE_KEY` | Stripe 公钥 |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 签名密钥 |
| `MUX_TOKEN_ID` | Mux API Token ID |
| `MUX_TOKEN_SECRET` | Mux API Token Secret |
| `ADMIN_EMAILS` | 管理员邮箱（逗号分隔） |

## 📊 数据模型

- **User** — 用户（含金币余额）
- **Account / Session** — NextAuth 认证
- **Series / Episode** — 剧集和集数（Mux 视频）
- **Purchase** — Stripe 支付记录
- **EpisodeUnlock** — 金币解锁记录
- **WatchEvent** — 观看事件（留存分析）
- **Card / UserCard** — 卡牌定义和用户收藏

---

Built with ❤️ in 7 days.
