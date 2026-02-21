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
    const existing = await prisma.seriesFavorite.findUnique({
      where: { userId_seriesId: { userId: session.user.id, seriesId } },
    })

    if (existing) {
      await prisma.seriesFavorite.delete({ where: { id: existing.id } })
    } else {
      await prisma.seriesFavorite.create({
        data: { userId: session.user.id, seriesId },
      })
    }

    const favoriteCount = await prisma.seriesFavorite.count({ where: { seriesId } })

    return NextResponse.json({
      favorited: !existing,
      favoriteCount,
    })
  } catch (error) {
    console.error("Favorite toggle error:", error)
    return NextResponse.json({ error: "Failed to toggle favorite" }, { status: 500 })
  }
}
