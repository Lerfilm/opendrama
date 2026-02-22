export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"
import { seedDefaultPrices, AiFeatureKey } from "@/lib/ai-pricing"

async function checkAdmin() {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) return null
  return session
}

/**
 * GET /api/admin/ai-pricing — returns all AI feature prices (seeds defaults if needed)
 */
export async function GET() {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  await seedDefaultPrices()
  const rows = await prisma.aiFeaturePrice.findMany({ orderBy: { featureKey: "asc" } })
  return NextResponse.json({ prices: rows })
}

/**
 * PUT /api/admin/ai-pricing — update a single feature price
 * Body: { featureKey, costCoins?, enabled? }
 */
export async function PUT(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { featureKey, costCoins, enabled } = await req.json() as {
    featureKey: AiFeatureKey
    costCoins?: number
    enabled?: boolean
  }

  if (!featureKey) {
    return NextResponse.json({ error: "featureKey required" }, { status: 400 })
  }

  const data: { costCoins?: number; enabled?: boolean } = {}
  if (typeof costCoins === "number" && costCoins >= 0) data.costCoins = costCoins
  if (typeof enabled === "boolean") data.enabled = enabled

  const updated = await prisma.aiFeaturePrice.update({
    where: { featureKey },
    data,
  })

  return NextResponse.json({ price: updated })
}
