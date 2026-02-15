import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getRandomRarity, shouldDropCard } from "@/lib/cards"

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { episodeId, completedRate } = await req.json()

    if (!episodeId || completedRate === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // 检查是否触发掉落（观看完成率 > 80%）
    if (!shouldDropCard(completedRate)) {
      return NextResponse.json({ dropped: false })
    }

    // 获取剧集信息
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      select: { seriesId: true },
    })

    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 })
    }

    // 获取该剧集的所有卡牌
    const cards = await prisma.card.findMany({
      where: { seriesId: episode.seriesId },
    })

    if (cards.length === 0) {
      return NextResponse.json({ dropped: false })
    }

    // 随机选择稀有度
    const rarity = getRandomRarity()

    // 从该稀有度的卡牌中随机选择一张
    const rarityCards = cards.filter((card) => card.rarity === rarity)

    if (rarityCards.length === 0) {
      // 如果该稀有度没有卡牌，随机选择一张
      const randomCard = cards[Math.floor(Math.random() * cards.length)]
      
      // 添加到用户收藏（或增加数量）
      const userCard = await prisma.userCard.upsert({
        where: {
          userId_cardId: {
            userId: session.user.id,
            cardId: randomCard.id,
          },
        },
        update: {
          quantity: {
            increment: 1,
          },
        },
        create: {
          userId: session.user.id,
          cardId: randomCard.id,
          quantity: 1,
        },
      })

      return NextResponse.json({
        dropped: true,
        card: {
          ...randomCard,
          quantity: userCard.quantity,
        },
      })
    }

    const droppedCard =
      rarityCards[Math.floor(Math.random() * rarityCards.length)]

    // 添加到用户收藏（或增加数量）
    const userCard = await prisma.userCard.upsert({
      where: {
        userId_cardId: {
          userId: session.user.id,
          cardId: droppedCard.id,
        },
      },
      update: {
        quantity: {
          increment: 1,
        },
      },
      create: {
        userId: session.user.id,
        cardId: droppedCard.id,
        quantity: 1,
      },
    })

    return NextResponse.json({
      dropped: true,
      card: {
        ...droppedCard,
        quantity: userCard.quantity,
      },
    })
  } catch (error) {
    console.error("Card drop error:", error)
    return NextResponse.json(
      { error: "Failed to drop card" },
      { status: 500 }
    )
  }
}
