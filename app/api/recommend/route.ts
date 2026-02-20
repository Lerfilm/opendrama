export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * 推荐算法：基于用户行为的内容推荐
 * - 协同过滤：看过类似剧集的用户也看了什么
 * - 热度排序：综合播放量、完成率
 * - 个性化：基于用户历史观看行为
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id

  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)
    const type = searchParams.get("type") || "home" // home, similar, trending

    if (type === "trending") {
      // 热度排行：过去7天播放量最高的剧集
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const trendingSeries = await prisma.$queryRaw`
        SELECT s.id, s.title, s."coverUrl", s.status,
               COUNT(DISTINCT we.id) as watch_count,
               AVG(we."completedRate") as avg_completion
        FROM series s
        JOIN episodes e ON e."seriesId" = s.id
        JOIN watch_events we ON we."episodeId" = e.id
        WHERE we."createdAt" > ${weekAgo}
          AND s.status = 'active'
        GROUP BY s.id
        ORDER BY watch_count DESC, avg_completion DESC
        LIMIT ${limit}
      ` as any[]

      return NextResponse.json({ series: trendingSeries, type: "trending" })
    }

    if (type === "similar" && userId) {
      // 基于用户看过的内容，推荐同类型的其他剧集
      const watchedSeriesIds = await prisma.watchEvent.findMany({
        where: { userId },
        select: { episode: { select: { seriesId: true } } },
        distinct: ["episodeId"],
        take: 20,
      })

      const watchedIds = [...new Set(watchedSeriesIds.map((w) => w.episode.seriesId))]

      if (watchedIds.length > 0) {
        // 找到看过同样剧集的用户，然后推荐他们看的其他剧集
        const similarUsers = await prisma.watchEvent.findMany({
          where: {
            episode: { seriesId: { in: watchedIds } },
            userId: { not: userId },
          },
          select: { userId: true },
          distinct: ["userId"],
          take: 50,
        })

        const similarUserIds = similarUsers.map((u) => u.userId)

        if (similarUserIds.length > 0) {
          const recommended = await prisma.series.findMany({
            where: {
              id: { notIn: watchedIds },
              status: "active",
              episodes: {
                some: {
                  watchEvents: {
                    some: { userId: { in: similarUserIds } },
                  },
                },
              },
            },
            select: {
              id: true,
              title: true,
              coverUrl: true,
              status: true,
              _count: { select: { episodes: true } },
            },
            take: limit,
          })

          return NextResponse.json({ series: recommended, type: "collaborative" })
        }
      }
    }

    // 默认：热门 + 最新混合推荐
    const [popular, latest] = await Promise.all([
      // 热门剧集（按观看量）
      prisma.series.findMany({
        where: { status: "active" },
        select: {
          id: true,
          title: true,
          coverUrl: true,
          status: true,
          _count: { select: { episodes: true } },
          episodes: {
            select: {
              _count: { select: { watchEvents: true } },
            },
          },
        },
        take: Math.ceil(limit / 2),
      }),
      // 最新上线
      prisma.series.findMany({
        where: { status: "active" },
        select: {
          id: true,
          title: true,
          coverUrl: true,
          status: true,
          createdAt: true,
          _count: { select: { episodes: true } },
        },
        orderBy: { createdAt: "desc" },
        take: Math.ceil(limit / 2),
      }),
    ])

    // 合并并去重
    const seen = new Set<string>()
    const merged = [...popular, ...latest].filter((s) => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    }).slice(0, limit)

    return NextResponse.json({ series: merged, type: "home" })
  } catch (error) {
    console.error("Recommend error:", error)
    return NextResponse.json(
      { error: "Failed to get recommendations" },
      { status: 500 }
    )
  }
}
