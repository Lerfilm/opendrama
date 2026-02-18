export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CARD_RARITIES, CardRarity } from "@/lib/cards"
import { Plus, Edit, Trash2 } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

export default async function AdminCardsPage() {
  const cards = await prisma.card.findMany({
    include: {
      series: {
        select: { title: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t("admin.cards.title")}</h1>
          <p className="text-muted-foreground">{t("admin.cards.desc")}</p>
        </div>
        <Link href="/admin/cards/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            {t("admin.cards.create")}
          </Button>
        </Link>
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {t("admin.cards.noCards")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {cards.map((card) => {
            const rarityInfo = CARD_RARITIES[card.rarity as CardRarity]

            return (
              <Card
                key={card.id}
                className={`overflow-hidden border-2 ${rarityInfo?.borderColor}`}
              >
                <CardContent className="p-0">
                  <div className="relative aspect-[3/4]">
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                    {rarityInfo && (
                      <Badge
                        className={`absolute top-2 right-2 text-xs ${rarityInfo.color}`}
                      >
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: rarityInfo.dotColor }} /> {rarityInfo.name}
                      </Badge>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold text-sm line-clamp-1 mb-1">
                      {card.name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-3">
                      {card.series.title}
                    </p>
                    <div className="flex gap-1">
                      <Link
                        href={`/admin/cards/${card.id}`}
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full">
                          <Edit className="w-3 h-3" />
                        </Button>
                      </Link>
                      <Button variant="outline" size="sm">
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
