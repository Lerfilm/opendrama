# DramaBox - 短剧视频平台

## 📋 项目概述

短剧视频平台 MVP，7天冲刺开发计划。

**技术栈：**
- Next.js 15 (App Router)
- TypeScript + Tailwind CSS
- Prisma ORM + PostgreSQL (Supabase)
- NextAuth v5 (Google OAuth)
- Stripe Checkout
- Mux Video
- shadcn/ui 组件

## 🚀 开发进度

### ✅ Day 0 - 脚手架 + 数据库 (完成)
- Next.js 15 项目初始化
- Prisma Schema 设计（8张核心表）
- 依赖安装：NextAuth, Stripe, Mux, Prisma
- Git 仓库初始化

### ✅ Day 1 - 认证 + UI (完成)
- NextAuth v5 + Google OAuth 配置
- 登录/注册流程
- 底部导航栏（首页/发现/我的）
- 竖屏布局适配
- shadcn/ui 组件集成
- 首页骨架（剧集卡片，模拟数据）

### 🔜 Day 2 - 视频系统
- Mux 视频上传和管理
- 剧集详情页
- 竖屏播放器 (MuxPlayer)
- 视频进度保存

### 🔜 Day 3 - 支付系统
- Stripe Checkout 集成
- 金币充值套餐
- Webhook 处理
- 购买记录

### 🔜 Day 4 - 卡牌 + 管理
- 卡牌收集系统
- CMS 后台（剧集/卡牌管理）
- 用户解锁记录

### 🔜 Day 5 - 数据分析
- WatchEvent 留存跟踪
- YouTube 级分析仪表盘
- 用户行为洞察

### 🔜 Day 6 - 优化
- 性能优化
- SEO 优化
- 错误处理
- 测试

### 🔜 Day 7 - 上线
- Vercel 部署
- 环境变量配置
- 域名绑定
- 监控和日志

## 🔧 本地开发

### 1. 环境配置

复制 `.env.local.example` 为 `.env.local` 并填写：

```bash
cp .env.local.example .env.local
```

需要配置：
- `DATABASE_URL` - Supabase PostgreSQL 连接字符串
- `AUTH_SECRET` - NextAuth 密钥 (`openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` - Stripe
- `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` - Mux Video

### 2. 数据库迁移

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 📁 项目结构

```
dramabox/
├── app/
│   ├── (main)/          # 主应用路由（需要认证）
│   │   ├── page.tsx     # 首页
│   │   ├── discover/    # 发现页
│   │   └── profile/     # 个人中心
│   ├── api/
│   │   └── auth/        # NextAuth API 路由
│   ├── auth/
│   │   └── signin/      # 登录页
│   └── layout.tsx       # 根布局
├── components/
│   ├── bottom-nav.tsx   # 底部导航
│   └── ui/              # shadcn/ui 组件
├── lib/
│   ├── auth.ts          # NextAuth 配置
│   ├── prisma.ts        # Prisma Client 单例
│   └── utils.ts         # 工具函数
└── prisma/
    └── schema.prisma    # 数据模型
```

## 📊 数据模型

核心表：
- **User** - 用户（含金币余额）
- **Account/Session** - NextAuth 认证
- **Purchase** - 支付记录（Stripe）
- **Series/Episode** - 剧集内容（Mux 视频）
- **EpisodeUnlock** - 解锁记录（金币消费）
- **WatchEvent** - 观看事件（留存分析）
- **Card/UserCard** - 卡牌收集

## 🎨 UI 组件

使用 shadcn/ui，已安装：
- Button
- Card
- Input
- Tabs
- Badge

按需添加：`npx shadcn@latest add [component-name]`

## 🚦 部署

### Vercel
1. 连接 GitHub 仓库
2. 配置环境变量（同 `.env.local`）
3. 部署

### Supabase
1. 创建新项目
2. 获取数据库连接字符串
3. 运行 Prisma 迁移

## 📝 Commit 规范

- `Day X: 简短描述` - 日进度提交
- 包含详细的功能清单
- 记录技术决策

## 🛠️ 技术决策

1. **NextAuth v5 beta** - 与 Prisma 集成最佳，稳定可靠
2. **Prisma 单例** - 避免开发环境热重载导致的连接池耗尽
3. **shadcn/ui** - 可定制的高质量组件
4. **竖屏优先** - 移动端短剧体验
5. **Server Actions** - 简化表单提交和数据变更

## 📚 相关文档

- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [NextAuth Docs](https://authjs.dev)
- [shadcn/ui](https://ui.shadcn.com)
- [Mux Video](https://docs.mux.com/guides/video/start-video-streaming)
- [Stripe Docs](https://stripe.com/docs)

---

**构建时间：** 2024 年（7天冲刺计划）  
**团队：** Nancy (指挥官), Joey (MiniMax x5), Charlie (审查员)
