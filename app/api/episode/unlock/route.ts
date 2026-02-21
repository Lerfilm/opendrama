export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { episodeId } = await req.json()

    if (!episodeId) {
      return NextResponse.json({ error: "Missing episodeId" }, { status: 400 })
    }

    // 检查剧集是否存在
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
    })

    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 })
    }

    // 检查是否已解锁
    const existingUnlock = await prisma.episodeUnlock.findUnique({
      where: {
        userId_episodeId: {
          userId: session.user.id,
          episodeId,
        },
      },
    })

    if (existingUnlock) {
      return NextResponse.json({ error: "Already unlocked" }, { status: 400 })
    }

    // 前5集免费
    if (episode.episodeNum <= 5) {
      await prisma.episodeUnlock.create({
        data: {
          userId: session.user.id,
          episodeId,
          coinsCost: 0,
        },
      })

      return NextResponse.json({ success: true })
    }

    // 检查金币余额
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { coins: true },
    })

    if (!user || user.coins < episode.unlockCost) {
      return NextResponse.json(
        { error: "Insufficient coins" },
        { status: 400 }
      )
    }

    // 扣除金币并解锁
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { coins: { decrement: episode.unlockCost } },
      }),
      prisma.episodeUnlock.create({
        data: {
          userId: session.user.id,
          episodeId,
          coinsCost: episode.unlockCost,
        },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Unlock error:", error)
    return NextResponse.json(
      { error: "Failed to unlock episode" },
      { status: 500 }
    )
  }
}
