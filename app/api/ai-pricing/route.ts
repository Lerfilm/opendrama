export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { getFeatureCost, DEFAULT_AI_PRICES, AiFeatureKey, seedDefaultPrices } from "@/lib/ai-pricing"
import prisma from "@/lib/prisma"

/**
 * GET /api/ai-pricing
 * Returns pricing for all features, or a single feature via ?feature=xxx
 * No auth required — prices are public read-only data.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const feature = searchParams.get("feature") as AiFeatureKey | null

  if (feature) {
    // Return single feature cost
    if (!(feature in DEFAULT_AI_PRICES)) {
      return NextResponse.json({ error: "Unknown feature" }, { status: 400 })
    }
    const cost = await getFeatureCost(feature)
    const def = DEFAULT_AI_PRICES[feature]
    return NextResponse.json({ featureKey: feature, label: def.label, costCoins: cost })
  }

  // Return all features
  await seedDefaultPrices()
  const rows = await prisma.aiFeaturePrice.findMany({ orderBy: { featureKey: "asc" } })
  return NextResponse.json({ prices: rows })
}
