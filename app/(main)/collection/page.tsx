export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { createT, getLocaleAsync } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { CardCollection } from "./card-collection"

const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 }

export default async function CollectionPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }
  const t = createT(await getLocaleAsync())

  const cards = await prisma.achievementCard.findMany({
    where: { userId: session.user.id },
    orderBy: { earnedAt: "desc" },
  })

  const rarityCounts = {
    legendary: cards.filter(c => c.rarity === "legendary").length,
    epic: cards.filter(c => c.rarity === "epic").length,
    rare: cards.filter(c => c.rarity === "rare").length,
    common: cards.filter(c => c.rarity === "common").length,
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("cards.collection")}</h1>
        <Badge variant="outline">{t("cards.count", { count: cards.length })}</Badge>
      </div>

      <CardCollection
        cards={cards.map(c => ({
          id: c.id,
          cardImage: c.cardImage,
          title: c.title,
          subtitle: c.subtitle,
          rarity: c.rarity as "common" | "rare" | "epic" | "legendary",
          earnedAt: c.earnedAt.toISOString(),
        }))}
        rarityCounts={rarityCounts}
      />
    </div>
  )
}
