# Stripe 配置指南

## 1. 获取 API 密钥

登录 [Stripe Dashboard](https://dashboard.stripe.com/)

1. 点击右上角 **Developers**
2. 进入 **API keys**
3. 复制：
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`

## 2. 配置 Webhook

### 本地开发（Stripe CLI）

1. 安装 Stripe CLI：
```bash
brew install stripe/stripe-cli/stripe
```

2. 登录：
```bash
stripe login
```

3. 转发 webhook 到本地：
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

4. 复制 webhook 签名密钥：
```
> Ready! Your webhook signing secret is whsec_xxxxx
```

5. 添加到 `.env.local`：
```
STRIPE_WEBHOOK_SECRET="whsec_xxxxx"
```

### 生产环境

1. 进入 [Stripe Dashboard](https://dashboard.stripe.com/) → **Developers** → **Webhooks**
2. 点击 **Add endpoint**
3. 填写：
   - **Endpoint URL**: `https://yourdomain.com/api/stripe/webhook`
   - **Events to send**: 选择 `checkout.session.completed`
4. 复制 **Signing secret** → `STRIPE_WEBHOOK_SECRET`

## 3. 测试支付

### 本地测试流程

1. 启动开发服务器：
```bash
npm run dev
```

2. 启动 Stripe CLI 监听：
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

3. 访问 `http://localhost:3000/recharge`

4. 选择套餐，点击"立即充值"

5. 使用测试卡号：
   - **成功**: `4242 4242 4242 4242`
   - **失败**: `4000 0000 0000 0002`
   - **需要验证**: `4000 0025 0000 3155`
   - 日期：任意未来日期
   - CVC：任意 3 位数字

6. 完成支付后：
   - Stripe CLI 会显示 webhook 事件
   - 用户金币自动增加
   - Purchase 记录创建

### 验证流程

1. 查看 Stripe CLI 输出：
```
[200] POST /api/stripe/webhook [evt_xxx]
```

2. 检查数据库：
```sql
SELECT * FROM purchases ORDER BY "createdAt" DESC LIMIT 1;
SELECT coins FROM users WHERE id = 'xxx';
```

3. 访问 `/purchases` 查看充值记录

## 4. Webhook 签名验证

代码位置：`app/api/stripe/webhook/route.ts`

```typescript
const signature = req.headers.get("stripe-signature")

const event = stripe.webhooks.constructEvent(
  body,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET!
)
```

**重要**：
- 必须使用原始请求体（`await req.text()`）
- 不能先 JSON 解析再验证
- Webhook Secret 必须正确

## 5. 常见问题

### Webhook 签名验证失败

**原因**：
- Webhook Secret 不匹配
- 请求体被修改（中间件处理）

**解决**：
1. 确认 `.env.local` 中的 `STRIPE_WEBHOOK_SECRET`
2. 重新运行 `stripe listen`
3. 检查 Next.js 中间件是否修改了请求体

### 支付成功但金币未增加

**检查**：
1. Webhook 是否收到事件
2. 数据库连接是否正常
3. 事务是否执行成功

**调试**：
```bash
# 查看 Stripe CLI 日志
stripe listen --forward-to localhost:3000/api/stripe/webhook --print-json

# 查看服务器日志
tail -f .next/server.log
```

### 测试支付时提示 "测试模式"

这是正常的！Stripe 会明确标注测试支付。生产环境中使用真实 API 密钥后会自动切换为真实支付。

## 6. 上线前检查清单

- [ ] 更换为生产环境 API 密钥
- [ ] 配置生产环境 Webhook URL
- [ ] 验证 Webhook 签名
- [ ] 测试真实支付（小金额）
- [ ] 启用 Stripe Radar（反欺诈）
- [ ] 配置邮件通知
- [ ] 检查税务设置（如需要）

## 7. 金币套餐配置

位置：`lib/stripe.ts`

```typescript
export const COIN_PACKAGES = [
  { id: "package_60", coins: 60, price: 600 },   // ¥6
  { id: "package_300", coins: 300, price: 3000 }, // ¥30
  { id: "package_1000", coins: 1000, price: 9800 }, // ¥98
  { id: "package_2000", coins: 2000, price: 19800 }, // ¥198
]
```

修改套餐：
1. 修改 `COIN_PACKAGES` 数组
2. 重启开发服务器
3. 无需修改数据库或 Stripe Dashboard

## 8. 监控和日志

生产环境建议：
1. 使用 Stripe Dashboard 查看支付状态
2. 设置 Webhook 失败通知
3. 记录关键事件日志（充值、金币变动）
4. 定期对账（Stripe 收入 vs 数据库记录）

---

**相关文档**：
- [Stripe Checkout 文档](https://stripe.com/docs/payments/checkout)
- [Stripe Webhook 文档](https://stripe.com/docs/webhooks)
- [测试卡号](https://stripe.com/docs/testing)
