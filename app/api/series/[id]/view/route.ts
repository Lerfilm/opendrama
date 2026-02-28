export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// SECURITY: In-memory rate limiter to prevent view count spam
// Key: "ip:seriesId", Value: last request timestamp
const viewRateMap = new Map<string, number>()
const VIEW_COOLDOWN_MS = 60_000 // 1 minute per IP per series

// Clean stale entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - VIEW_COOLDOWN_MS * 2
  for (const [key, ts] of viewRateMap) {
    if (ts < cutoff) viewRateMap.delete(key)
  }
}, 600_000)

// POST: increment view count (no auth required, rate-limited per IP)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: seriesId } = await params

  // Rate limit by IP + seriesId
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rateKey = `${ip}:${seriesId}`
  const lastView = viewRateMap.get(rateKey) || 0

  if (Date.now() - lastView < VIEW_COOLDOWN_MS) {
    // Silently accept but don't increment — avoids revealing the limit
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      select: { viewCount: true },
    })
    return NextResponse.json({ viewCount: series?.viewCount ?? 0 })
  }

  viewRateMap.set(rateKey, Date.now())

  try {
    const series = await prisma.series.update({
      where: { id: seriesId },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    })

    return NextResponse.json({ viewCount: series.viewCount })
  } catch (error) {
    console.error("View count error:", error)
    return NextResponse.json({ error: "Failed to record view" }, { status: 500 })
  }
}
