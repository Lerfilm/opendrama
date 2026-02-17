export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { stripe, COIN_PACKAGES } from "@/lib/stripe"

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { packageId } = await req.json()

    const pkg = COIN_PACKAGES.find((p) => p.id === packageId)

    if (!pkg) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 })
    }

    // 创建 Stripe Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: session.user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "cny",
            product_data: {
              name: pkg.name,
              description: pkg.description,
              images: ["https://picsum.photos/seed/coins/400/400"],
            },
            unit_amount: pkg.price,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: session.user.id,
        packageId: pkg.id,
        coins: pkg.coins.toString(),
      },
      success_url: `${req.nextUrl.origin}/recharge/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/recharge`,
    })

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    })
  } catch (error) {
    console.error("Stripe checkout error:", error)
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    )
  }
}
