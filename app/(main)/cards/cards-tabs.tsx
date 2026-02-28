"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Sparkles } from "@/components/icons"
import Link from "next/link"

interface CardInfo {
  id: string
  name: string
  rarity: string
  imageUrl: string
  seriesTitle: string
}

interface UserCardInfo {
  id: string
  quantity: number
  card: CardInfo
}

interface RarityGroup {
  name: string
  dotColor: string
  borderColor: string
  color: string
  cards: { id: string; quantity: number; card: { id: string; name: string; imageUrl: string; seriesTitle: string } }[]
}

interface AllCardInfo extends CardInfo {
  isOwned: boolean
}

interface CardsTabsProps {
  userCards: UserCardInfo[]
  allCards: AllCardInfo[]
  cardsByRarity: Record<string, RarityGroup>
  translations: {
    collection: string
    gallery: string
    noCards: string
    noCardsHint: string
    startWatch: string
    notObtained: string
  }
}

export function CardsTabs({ userCards, allCards, cardsByRarity, translations: t }: CardsTabsProps) {
  const [tab, setTab] = useState<"collection" | "gallery">("collection")

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("collection")}
          className={`rounded-full px-5 py-1.5 text-sm font-medium transition-all border ${
            tab === "collection"
              ? "bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/20"
              : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
          }`}
        >
          {t.collection}
        </button>
        <button
          onClick={() => setTab("gallery")}
          className={`rounded-full px-5 py-1.5 text-sm font-medium transition-all border ${
            tab === "gallery"
              ? "bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/20"
              : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
          }`}
        >
          {t.gallery}
        </button>
      </div>

      {/* Collection Tab */}
      {tab === "collection" && (
        <div className="space-y-6">
          {userCards.length === 0 ? (
            <div className="text-center py-16">
              <Sparkles className="w-10 h-10 mx-auto mb-3 text-white/20" />
              <p className="text-white/50 mb-1">{t.noCards}</p>
              <p className="text-sm text-white/30 mb-4">{t.noCardsHint}</p>
              <Link
                href="/discover"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple-500 text-white text-sm font-medium hover:bg-purple-400 transition-colors"
              >
                {t.startWatch}
              </Link>
            </div>
          ) : (
            Object.entries(cardsByRarity).map(([rarity, group]) => {
              if (group.cards.length === 0) return null
              return (
                <div key={rarity}>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-white/80">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.dotColor }} />
                    {group.name} ({group.cards.length})
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {group.cards.map((uc) => (
                      <div
                        key={uc.id}
                        className="group relative rounded-2xl overflow-hidden bg-purple-900/30
                                   ring-1 ring-white/10 hover:ring-white/20
                                   hover:shadow-xl hover:shadow-purple-500/10
                                   transition-all duration-300 hover:scale-[1.02]"
                      >
                        <div className="relative aspect-[3/4]">
                          <img
                            src={uc.card.imageUrl}
                            alt={uc.card.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <Badge className="absolute top-1.5 right-1.5 text-[10px] bg-black/60 text-white border-0">
                            x{uc.quantity}
                          </Badge>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0
                                        bg-gradient-to-t from-black/90 via-black/50 to-transparent
                                        px-2.5 pt-8 pb-2.5">
                          <p className="text-white font-bold text-[11px] leading-tight line-clamp-1">{uc.card.name}</p>
                          <p className="text-white/40 text-[10px] line-clamp-1">{uc.card.seriesTitle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Gallery Tab */}
      {tab === "gallery" && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {allCards.map((card) => (
            <div
              key={card.id}
              className={`group relative rounded-2xl overflow-hidden bg-purple-900/30
                         ring-1 ring-white/5
                         transition-all duration-300
                         ${card.isOwned ? "hover:shadow-xl hover:shadow-purple-500/10 hover:scale-[1.02] hover:ring-white/20" : "opacity-50"}`}
            >
              <div className="relative aspect-[3/4]">
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  className={`w-full h-full object-cover transition-transform duration-500
                             ${card.isOwned ? "group-hover:scale-105" : "grayscale"}`}
                />
                {!card.isOwned && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <span className="text-white/60 text-[10px] font-medium">{t.notObtained}</span>
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0
                              bg-gradient-to-t from-black/90 via-black/50 to-transparent
                              px-2.5 pt-8 pb-2.5">
                <p className="text-white font-bold text-[11px] leading-tight line-clamp-1">{card.name}</p>
                <p className="text-white/40 text-[10px] line-clamp-1">{card.seriesTitle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
