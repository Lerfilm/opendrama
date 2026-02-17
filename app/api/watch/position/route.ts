export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const episodeId = searchParams.get("episodeId")

    if (!episodeId) {
      return NextResponse.json(
        { error: "Missing episodeId" },
        { status: 400 }
      )
    }

    // 获取最近的观看记录
    const lastEvent = await prisma.watchEvent.findFirst({
      where: {
        userId: session.user.id,
        episodeId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        watchPosition: true,
      },
    })

    return NextResponse.json({
      position: lastEvent?.watchPosition || 0,
    })
  } catch (error) {
    console.error("Get watch position error:", error)
    return NextResponse.json(
      { error: "Failed to get watch position" },
      { status: 500 }
    )
  }
}
