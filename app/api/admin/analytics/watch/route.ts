export const dynamic = "force-dynamic";
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    // Completion rate distribution
    const completionDistribution = await prisma.$queryRaw<
      { bucket: string; count: bigint }[]
    >`
      SELECT
        CASE
          WHEN "completedRate" < 0.25 THEN '0-25%'
          WHEN "completedRate" < 0.50 THEN '25-50%'
          WHEN "completedRate" < 0.75 THEN '50-75%'
          ELSE '75-100%'
        END as bucket,
        COUNT(*)::bigint as count
      FROM watch_events
      GROUP BY bucket
      ORDER BY bucket ASC
    `

    // Average watch duration
    const avgDuration = await prisma.watchEvent.aggregate({
      _avg: { watchDuration: true },
    })

    // Top 10 series by watch count
    const topSeries = await prisma.$queryRaw<
      { id: string; title: string; watch_count: bigint }[]
    >`
      SELECT s.id, s.title, COUNT(w.id)::bigint as watch_count
      FROM series s
      JOIN episodes e ON e."seriesId" = s.id
      JOIN watch_events w ON w."episodeId" = e.id
      GROUP BY s.id, s.title
      ORDER BY watch_count DESC
      LIMIT 10
    `

    return NextResponse.json({
      completionDistribution: completionDistribution.map((r) => ({
        bucket: r.bucket,
        count: Number(r.count),
      })),
      avgWatchDuration: Math.round(avgDuration._avg.watchDuration ?? 0),
      topSeries: topSeries.map((r) => ({
        id: r.id,
        title: r.title,
        watchCount: Number(r.watch_count),
      })),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
