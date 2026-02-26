export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Coins } from "@/components/icons"
import Link from "next/link"
import { createT, getLocaleAsync } from "@/lib/i18n"

/**
 * Fallback fulfillment: if webhook hasn't processed the payment yet,
 * verify with Stripe API and credit coins directly.
 * Idempotent — won't double-credit because we check for existing purchase.
 */
async function fulfillPayment(sessionId: string, userId: string) {
  // Already processed?
  const existing = await prisma.purchase.findUnique({
    where: { stripeSessionId: sessionId },
  })
  if (existing) return existing

  // Verify with Stripe
  let stripeSession
  try {
    stripeSession = await stripe.checkout.sessions.retrieve(sessionId)
  } catch (err) {
    console.error("[fulfillPayment] Failed to retrieve Stripe session:", err)
    return null
  }

  // Only process completed payments
  if (stripeSession.payment_status !== "paid") return null

  // Verify this session belongs to this user
  if (stripeSession.metadata?.userId !== userId) return null

  const coins = parseInt(stripeSession.metadata?.coins || "0")
  const packageId = stripeSession.metadata?.packageId
  if (!coins) return null

  // Credit coins in a transaction (same logic as webhook)
  try {
    const purchase = await prisma.$transaction(async (tx) => {
      // Double-check inside transaction
      const check = await tx.purchase.findUnique({
        where: { stripeSessionId: sessionId },
      })
      if (check) return check

      // 1. Create purchase record
      const p = await tx.purchase.create({
        data: {
          userId,
          stripeSessionId: sessionId,
          amount: stripeSession.amount_total || 0,
          coins,
          status: "completed",
        },
      })

      // 2. Update users.coins (legacy field)
      await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: coins } },
      })

      // 3. Upsert user_balances
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
          description: `Stripe 充值 ${coins} 金币（${sessionId}）`,
          metadata: {
            stripeSessionId: sessionId,
            packageId,
            amountCents: stripeSession.amount_total,
            source: "success-page-fallback",
          },
        },
      })

      return p
    })

    console.log(`[fulfillPayment] Credited ${coins} coins to user ${userId} (fallback)`)
    return purchase
  } catch (err) {
    console.error("[fulfillPayment] Transaction failed:", err)
    return null
  }
}

export default async function RechargeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }
  const t = createT(await getLocaleAsync())

  const params = await searchParams
  const sessionId = params.session_id

  let purchase = null
  let user = null

  if (sessionId) {
    // Try fulfillment (idempotent — safe to call even if webhook already processed)
    purchase = await fulfillPayment(sessionId, session.user.id)

    const userBalance = await prisma.userBalance.findUnique({
      where: { userId: session.user.id },
      select: { balance: true, reserved: true },
    })
    user = { coins: userBalance ? userBalance.balance - userBalance.reserved : 0 }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{t("recharge.successTitle")}</h1>
            <p className="text-muted-foreground">
              {t("recharge.successDesc")}
            </p>
          </div>

          {purchase && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Coins className="w-6 h-6 text-amber-600" />
                <span className="text-3xl font-bold text-amber-600">
                  +{purchase.coins}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("recharge.payAmount", { amount: (purchase.amount / 100).toFixed(2) })}
              </p>
            </div>
          )}

          {user && (
            <div className="bg-muted rounded-lg p-4 mb-6">
              <p className="text-sm text-muted-foreground mb-1">{t("purchases.currentBalance")}</p>
              <div className="flex items-center justify-center gap-2">
                <Coins className="w-6 h-6 text-primary" />
                <span className="text-2xl font-bold">{user.coins}</span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Link href="/">
              <Button className="w-full" size="lg">
                {t("recharge.startWatch")}
              </Button>
            </Link>
            <Link href="/purchases">
              <Button variant="outline" className="w-full" size="lg">
                {t("recharge.viewHistory")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
