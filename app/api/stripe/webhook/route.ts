import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
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
    const coins = parseInt(session.metadata?.coins || "0")

    if (!userId || !coins) {
      console.error("Missing metadata in session:", session.id)
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 })
    }

    try {
      // 检查是否已处理
      const existing = await prisma.purchase.findUnique({
        where: { stripeSessionId: session.id },
      })

      if (existing) {
        console.log("Purchase already processed:", session.id)
        return NextResponse.json({ received: true })
      }

      // 创建购买记录 + 增加金币（事务）
      await prisma.$transaction([
        prisma.purchase.create({
          data: {
            userId,
            stripeSessionId: session.id,
            amount: session.amount_total || 0,
            coins,
            status: "completed",
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            coins: {
              increment: coins,
            },
          },
        }),
      ])

      console.log(`✅ User ${userId} purchased ${coins} coins`)
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
