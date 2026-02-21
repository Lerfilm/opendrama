export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

/**
 * Cron job to update recommendation scores for all published scripts.
 * Formula: score = (viewCount + avgRating * ratingCount * 10 + likeCount * 2 + commentCount * 3)
 *                  / pow(hoursSincePublish + 2, 1.8)
 *
 * Can be called by Vercel Cron or external scheduler.
 * Protected by CRON_SECRET header.
 */
export async function POST(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const published = await prisma.publishedScript.findMany({
      where: { status: { in: ["published", "featured"] } },
      select: {
        id: true,
        publishedAt: true,
        viewCount: true,
        likeCount: true,
        commentCount: true,
        ratingSum: true,
        ratingCount: true,
      },
    })

    const now = Date.now()
    let updated = 0

    for (const p of published) {
      const hoursSince = (now - p.publishedAt.getTime()) / (1000 * 60 * 60)
      const avgRating = p.ratingCount > 0 ? p.ratingSum / p.ratingCount : 0

      const rawScore =
        p.viewCount +
        avgRating * p.ratingCount * 10 +
        p.likeCount * 2 +
        p.commentCount * 3

      const decay = Math.pow(hoursSince + 2, 1.8)
      const score = rawScore / decay

      await prisma.publishedScript.update({
        where: { id: p.id },
        data: { recommendScore: Math.round(score * 1000) / 1000 },
      })
      updated++
    }

    return NextResponse.json({ updated, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error("Update scores error:", error)
    return NextResponse.json({ error: "Failed to update scores" }, { status: 500 })
  }
}

// Also support GET for Vercel Cron
export async function GET(req: NextRequest) {
  return POST(req)
}
