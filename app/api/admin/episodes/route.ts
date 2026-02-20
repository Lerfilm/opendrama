export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

// 创建单集
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    requireAdmin(session.user.email)

    const { seriesId, episodeNum, title, description, muxPlaybackId, muxAssetId, duration, unlockCost } = await req.json()

    if (!seriesId || !title || episodeNum === undefined) {
      return NextResponse.json({ error: "seriesId, title, and episodeNum are required" }, { status: 400 })
    }

    const episode = await prisma.episode.create({
      data: {
        seriesId,
        episodeNum,
        title,
        description: description || null,
        muxPlaybackId: muxPlaybackId || null,
        muxAssetId: muxAssetId || null,
        duration: duration || null,
        unlockCost: unlockCost ?? 10,
      },
    })

    return NextResponse.json({ episode })
  } catch (error) {
    console.error("Failed to create episode:", error)
    return NextResponse.json({ error: "Failed to create episode" }, { status: 500 })
  }
}
