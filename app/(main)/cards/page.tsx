export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { CARD_RARITIES, CardRarity } from "@/lib/cards"
import { Sparkles } from "@/components/icons"
import { createT, getLocaleAsync } from "@/lib/i18n"
import Link from "next/link"
import { CardsTabs } from "./cards-tabs"

export default async function CardsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }
  const t = createT(await getLocaleAsync())

  const allCards = await prisma.card.findMany({
    include: {
      series: {
        select: { title: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const userCards = await prisma.userCard.findMany({
    where: { userId: session.user.id },
    include: {
      card: {
        include: {
          series: {
            select: { title: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  const userCardIds = new Set(userCards.map((uc) => uc.cardId))

  const cardsByRarity = userCards.reduce((acc, uc) => {
    const rarity = uc.card.rarity as CardRarity
    if (!acc[rarity]) acc[rarity] = []
    acc[rarity].push(uc)
    return acc
  }, {} as Record<CardRarity, typeof userCards>)

  // Rarity counts for stats
  const rarityCounts = Object.entries(CARD_RARITIES).map(([rarity, info]) => ({
    rarity,
    name: info.name,
    dotColor: info.dotColor,
    count: (cardsByRarity[rarity as CardRarity] || []).length,
  }))

  const collectionPercent = allCards.length > 0
    ? Math.round((userCards.length / allCards.length) * 100)
    : 0

  return (
    <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 min-h-screen bg-gradient-to-b from-purple-950 via-[#1a0a2e] to-black text-white">
      <div className="px-4 pt-4 pb-24 md:px-6 md:pt-6 max-w-screen-lg mx-auto">

        {/* Header Stats */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-6 h-6 text-purple-300" />
            <h1 className="text-xl font-bold">{t("cards.collection")}</h1>
          </div>

          {/* Stats Banner */}
          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-white/50 mb-0.5">{t("cards.myCollection")}</p>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold">{userCards.length}</span>
                  <span className="text-sm text-white/40">/ {allCards.length}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/50 mb-0.5">{t("cards.collectionProgress")}</p>
                <p className="text-2xl font-bold text-purple-300">{collectionPercent}%</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                style={{ width: `${collectionPercent}%` }}
              />
            </div>

            {/* Rarity breakdown */}
            <div className="flex items-center gap-4 mt-3">
              {rarityCounts.map((rc) => (
                <div key={rc.rarity} className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: rc.dotColor }} />
                  <span className="text-[10px] text-white/50">{rc.name}</span>
                  <span className="text-[10px] font-semibold text-white/80">{rc.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs: Collection / Gallery */}
        <CardsTabs
          userCards={userCards.map(uc => ({
            id: uc.id,
            quantity: uc.quantity,
            card: {
              id: uc.card.id,
              name: uc.card.name,
              rarity: uc.card.rarity,
              imageUrl: uc.card.imageUrl,
              seriesTitle: uc.card.series.title,
            },
          }))}
          allCards={allCards.map(c => ({
            id: c.id,
            name: c.name,
            rarity: c.rarity,
            imageUrl: c.imageUrl,
            seriesTitle: c.series.title,
            isOwned: userCardIds.has(c.id),
          }))}
          cardsByRarity={Object.fromEntries(
            Object.entries(CARD_RARITIES).map(([rarity, info]) => [
              rarity,
              {
                name: info.name,
                dotColor: info.dotColor,
                borderColor: info.borderColor,
                color: info.color,
                cards: (cardsByRarity[rarity as CardRarity] || []).map(uc => ({
                  id: uc.id,
                  quantity: uc.quantity,
                  card: {
                    id: uc.card.id,
                    name: uc.card.name,
                    imageUrl: uc.card.imageUrl,
                    seriesTitle: uc.card.series.title,
                  },
                })),
              },
            ])
          )}
          translations={{
            collection: t("cards.collection"),
            gallery: t("cards.gallery"),
            noCards: t("cards.noCards"),
            noCardsHint: t("cards.noCardsHint"),
            startWatch: t("home.startWatch"),
            notObtained: t("cards.notObtained"),
          }}
        />
      </div>
    </div>
  )
}
