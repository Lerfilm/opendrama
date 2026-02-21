export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// POST: increment view count (no auth required)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: seriesId } = await params

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
