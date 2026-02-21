export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET: get user's continue-watching list
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ items: [] })
  }

  try {
    // Get latest watch event for each series (via episodes), max 6
    const watchEvents = await prisma.watchEvent.findMany({
      where: { userId: session.user.id },
      include: {
        episode: {
          include: {
            series: {
              select: { id: true, title: true, coverUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    // Deduplicate by series, keep latest
    const seriesMap = new Map<string, {
      seriesId: string
      seriesTitle: string
      coverUrl: string | null
      episodeId: string
      episodeNum: number
      completedRate: number
    }>()

    for (const we of watchEvents) {
      const sid = we.episode.series.id
      if (!seriesMap.has(sid) && we.completedRate < 0.95) {
        seriesMap.set(sid, {
          seriesId: sid,
          seriesTitle: we.episode.series.title,
          coverUrl: we.episode.series.coverUrl,
          episodeId: we.episode.id,
          episodeNum: we.episode.episodeNum,
          completedRate: we.completedRate,
        })
      }
      if (seriesMap.size >= 6) break
    }

    return NextResponse.json({ items: Array.from(seriesMap.values()) })
  } catch (error) {
    console.error("Continue watching error:", error)
    return NextResponse.json({ items: [] })
  }
}
