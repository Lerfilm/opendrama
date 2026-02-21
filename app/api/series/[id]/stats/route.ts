export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET: all interaction stats for a series
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: seriesId } = await params
  const session = await auth()
  const userId = session?.user?.id

  try {
    const [series, likeCount, favoriteCount, ratingAgg, commentCount, userLike, userFavorite, userRating] = await Promise.all([
      prisma.series.findUnique({
        where: { id: seriesId },
        select: { viewCount: true },
      }),
      prisma.seriesLike.count({ where: { seriesId } }),
      prisma.seriesFavorite.count({ where: { seriesId } }),
      prisma.seriesRating.aggregate({
        where: { seriesId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      prisma.seriesComment.count({ where: { seriesId } }),
      userId
        ? prisma.seriesLike.findUnique({ where: { userId_seriesId: { userId, seriesId } } })
        : null,
      userId
        ? prisma.seriesFavorite.findUnique({ where: { userId_seriesId: { userId, seriesId } } })
        : null,
      userId
        ? prisma.seriesRating.findUnique({ where: { userId_seriesId: { userId, seriesId } } })
        : null,
    ])

    return NextResponse.json({
      viewCount: series?.viewCount || 0,
      likeCount,
      favoriteCount,
      avgRating: Math.round((ratingAgg._avg.rating || 0) * 10) / 10,
      totalRatings: ratingAgg._count.rating,
      commentCount,
      userLiked: !!userLike,
      userFavorited: !!userFavorite,
      userRating: userRating?.rating || null,
    })
  } catch (error) {
    console.error("Stats error:", error)
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
  }
}
