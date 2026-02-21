export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: seriesId } = await params

  try {
    const { rating } = await req.json()

    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 })
    }

    // Upsert: one user one series one rating
    await prisma.seriesRating.upsert({
      where: { userId_seriesId: { userId: session.user.id, seriesId } },
      update: { rating },
      create: { userId: session.user.id, seriesId, rating },
    })

    // Get aggregate stats
    const agg = await prisma.seriesRating.aggregate({
      where: { seriesId },
      _avg: { rating: true },
      _count: { rating: true },
    })

    return NextResponse.json({
      averageRating: Math.round((agg._avg.rating || 0) * 10) / 10,
      totalRatings: agg._count.rating,
      userRating: rating,
    })
  } catch (error) {
    console.error("Rate error:", error)
    return NextResponse.json({ error: "Failed to rate" }, { status: 500 })
  }
}
