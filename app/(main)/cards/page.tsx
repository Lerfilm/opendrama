export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CARD_RARITIES, CardRarity } from "@/lib/cards"
import { Sparkles } from "@/components/icons"
import { createT, getLocaleAsync } from "@/lib/i18n"
import { EmptyState } from "@/components/empty-state"

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

  return (
    <div className="p-4 pb-20">
      <div className="max-w-screen-sm mx-auto space-y-6">
        <Card className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">{t("cards.myCollection")}</p>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-8 h-8" />
                  <span className="text-4xl font-bold">
                    {userCards.length}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs opacity-75">{t("cards.collectionProgress")}</p>
                <p className="text-2xl font-bold">
                  {allCards.length > 0
                    ? Math.round(
                        (userCards.length / allCards.length) * 100
                      )
                    : 0}
                  %
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="collection" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="collection">{t("cards.collection")}</TabsTrigger>
            <TabsTrigger value="gallery">{t("cards.gallery")}</TabsTrigger>
          </TabsList>

          <TabsContent value="collection" className="space-y-4 mt-4">
            {userCards.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="w-8 h-8" />}
                title={t("cards.noCards")}
                description={t("cards.noCardsHint")}
                action={{ label: t("home.startWatch"), href: "/discover" }}
              />
            ) : (
              Object.entries(CARD_RARITIES).map(([rarity, info]) => {
                const cards = cardsByRarity[rarity as CardRarity] || []
                if (cards.length === 0) return null

                return (
                  <div key={rarity}>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: info.dotColor }} /> {info.name} ({cards.length})
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {cards.map((uc) => (
                        <div key={uc.id} className="relative">
                          <Card
                            className={`overflow-hidden border-2 ${info.borderColor}`}
                          >
                            <CardContent className="p-0">
                              <div className="relative aspect-[3/4]">
                                <img
                                  src={uc.card.imageUrl}
                                  alt={uc.card.name}
                                  className="w-full h-full object-cover"
                                />
                                <Badge
                                  className={`absolute top-1 right-1 text-xs ${info.color}`}
                                >
                                  x{uc.quantity}
                                </Badge>
                              </div>
                              <div className="p-2">
                                <p className="text-xs font-medium line-clamp-1">
                                  {uc.card.name}
                                </p>
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {uc.card.series.title}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </TabsContent>

          <TabsContent value="gallery" className="mt-4">
            <div className="grid grid-cols-3 gap-3">
              {allCards.map((card) => {
                const isOwned = userCardIds.has(card.id)
                const rarityInfo =
                  CARD_RARITIES[card.rarity as CardRarity]

                return (
                  <div key={card.id} className="relative">
                    <Card
                      className={`overflow-hidden border-2 ${
                        rarityInfo?.borderColor
                      } ${!isOwned ? "opacity-50" : ""}`}
                    >
                      <CardContent className="p-0">
                        <div className="relative aspect-[3/4]">
                          <img
                            src={card.imageUrl}
                            alt={card.name}
                            className={`w-full h-full object-cover ${
                              !isOwned ? "grayscale" : ""
                            }`}
                          />
                          {rarityInfo && (
                            <Badge
                              className={`absolute top-1 right-1 text-xs ${rarityInfo.color}`}
                            >
                              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: rarityInfo.dotColor }} />
                            </Badge>
                          )}
                          {!isOwned && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs">
                              {t("cards.notObtained")}
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-medium line-clamp-1">
                            {card.name}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {card.series.title}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
