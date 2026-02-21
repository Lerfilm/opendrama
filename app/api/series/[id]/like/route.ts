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
    const existing = await prisma.seriesLike.findUnique({
      where: { userId_seriesId: { userId: session.user.id, seriesId } },
    })

    if (existing) {
      await prisma.seriesLike.delete({ where: { id: existing.id } })
    } else {
      await prisma.seriesLike.create({
        data: { userId: session.user.id, seriesId },
      })
    }

    const likeCount = await prisma.seriesLike.count({ where: { seriesId } })

    return NextResponse.json({
      liked: !existing,
      likeCount,
    })
  } catch (error) {
    console.error("Like toggle error:", error)
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 })
  }
}
