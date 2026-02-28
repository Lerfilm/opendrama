export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { stripe, COIN_PACKAGES } from "@/lib/stripe"
import prisma from "@/lib/prisma"
import Stripe from "stripe"

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // 处理 checkout.session.completed 事件
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    const userId = session.metadata?.userId
    const packageId = session.metadata?.packageId

    if (!userId || !packageId) {
      console.error("Missing metadata in session:", session.id)
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 })
    }

    // SECURITY: Validate coins from server-side COIN_PACKAGES, never trust client metadata
    const pkg = COIN_PACKAGES.find((p) => p.id === packageId)
    if (!pkg) {
      console.error("Invalid packageId in webhook:", packageId, session.id)
      return NextResponse.json({ error: "Invalid package" }, { status: 400 })
    }

    // Verify the payment amount strictly matches the expected package price
    if (!session.amount_total || session.amount_total !== pkg.price) {
      console.error("Amount mismatch:", session.amount_total, "expected:", pkg.price, session.id)
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 })
    }

    const coins = pkg.coins

    try {
      // 检查是否已处理
      const existing = await prisma.purchase.findUnique({
        where: { stripeSessionId: session.id },
      })

      if (existing) {
        // Already processed, skip
        return NextResponse.json({ received: true })
      }

      // 创建购买记录 + 增加金币（事务）
      await prisma.$transaction(async (tx) => {
        // 1. 创建购买记录
        await tx.purchase.create({
          data: {
            userId,
            stripeSessionId: session.id,
            amount: session.amount_total || 0,
            coins,
            status: "completed",
          },
        })

        // 2. 更新 users.coins（兼容旧字段）
        await tx.user.update({
          where: { id: userId },
          data: { coins: { increment: coins } },
        })

        // 3. Upsert user_balances（余额 API 读取此表）
        const currentBalance = await tx.userBalance.findUnique({
          where: { userId },
        })
        const newBalance = (currentBalance?.balance ?? 0) + coins
        await tx.userBalance.upsert({
          where: { userId },
          create: {
            userId,
            balance: coins,
            totalPurchased: coins,
          },
          update: {
            balance: { increment: coins },
            totalPurchased: { increment: coins },
          },
        })

        // 4. Token transaction log
        await tx.tokenTransaction.create({
          data: {
            userId,
            type: "purchase",
            amount: coins,
            balanceAfter: newBalance,
            description: `Stripe purchase: ${coins} coins (${session.id})`,
            metadata: {
              stripeSessionId: session.id,
              packageId,
              amountCents: session.amount_total,
            },
          },
        })

        // 5. First charge bonus: double coins on first purchase
        const balanceRecord = await tx.userBalance.findUnique({
          where: { userId },
        })
        if (balanceRecord && !balanceRecord.firstChargeBonusUsed) {
          await tx.userBalance.update({
            where: { userId },
            data: {
              balance: { increment: coins },
              totalPurchased: { increment: coins },
              firstChargeBonusUsed: true,
            },
          })
          await tx.user.update({
            where: { id: userId },
            data: { coins: { increment: coins } },
          })
          await tx.tokenTransaction.create({
            data: {
              userId,
              type: "bonus",
              amount: coins,
              balanceAfter: newBalance + coins,
              description: `First charge bonus: ${coins} coins`,
              metadata: {
                stripeSessionId: session.id,
                source: "first_charge_bonus",
              },
            },
          })
        }
      })

      // Payment processed successfully
    } catch (error) {
      console.error("Failed to process payment:", error)
      return NextResponse.json(
        { error: "Failed to process payment" },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ received: true })
}
