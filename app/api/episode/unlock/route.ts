export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { directDeduction } from "@/lib/tokens"

// Configurable free episode threshold (env override or default 5)
const FREE_EPISODE_COUNT = parseInt(process.env.FREE_EPISODE_COUNT || "5", 10)

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

    // Free episodes (configurable via FREE_EPISODE_COUNT env var, default 5)
    if (episode.episodeNum <= FREE_EPISODE_COUNT) {
      await prisma.episodeUnlock.create({
        data: {
          userId: session.user.id,
          episodeId,
          coinsCost: 0,
        },
      })

      return NextResponse.json({ success: true })
    }

    // Atomic balance check + deduction using directDeduction()
    // Updates UserBalance and creates TokenTransaction audit
    const charged = await directDeduction(
      session.user.id,
      episode.unlockCost,
      {
        type: "episode_unlock",
        episodeId,
        episodeNum: episode.episodeNum,
      }
    )

    if (!charged) {
      return NextResponse.json(
        { error: "Insufficient coins" },
        { status: 400 }
      )
    }

    // Create unlock record (upsert to handle race condition gracefully)
    await prisma.episodeUnlock.upsert({
      where: {
        userId_episodeId: {
          userId: session.user.id,
          episodeId,
        },
      },
      update: {}, // already exists — no-op
      create: {
        userId: session.user.id,
        episodeId,
        coinsCost: episode.unlockCost,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Unlock error:", error)
    return NextResponse.json(
      { error: "Failed to unlock episode" },
      { status: 500 }
    )
  }
}
