"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"

interface CardData {
  id: string
  cardImage: string
  title: string
  subtitle: string | null
  rarity: "common" | "rare" | "epic" | "legendary"
  earnedAt: string
}

const RARITY_STYLES = {
  common: {
    border: "border-gray-300 dark:border-gray-600",
    glow: "",
    label: "Common",
    labelBg: "bg-gray-500",
  },
  rare: {
    border: "border-blue-400",
    glow: "shadow-[0_0_15px_rgba(59,130,246,0.3)]",
    label: "Rare",
    labelBg: "bg-blue-500",
  },
  epic: {
    border: "border-purple-500",
    glow: "shadow-[0_0_20px_rgba(168,85,247,0.4)]",
    label: "Epic",
    labelBg: "bg-purple-600",
  },
  legendary: {
    border: "border-yellow-400",
    glow: "shadow-[0_0_25px_rgba(250,204,21,0.5)]",
    label: "Legendary",
    labelBg: "bg-gradient-to-r from-yellow-500 to-amber-500",
  },
}

const FILTERS = [
  { key: "all", label: "cards.all" },
  { key: "legendary", label: "cards.legendary" },
  { key: "epic", label: "cards.epic" },
  { key: "rare", label: "cards.rare" },
  { key: "common", label: "cards.common" },
]

export function CardCollection({
  cards,
  rarityCounts,
}: {
  cards: CardData[]
  rarityCounts: Record<string, number>
}) {
  const [filter, setFilter] = useState("all")
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null)

  const filtered = filter === "all" ? cards : cards.filter(c => c.rarity === filter)

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map(f => {
          const count = f.key === "all" ? cards.length : rarityCounts[f.key] || 0
          return (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap text-xs"
              onClick={() => setFilter(f.key)}
            >
              {t(f.label)} {count > 0 && `(${count})`}
            </Button>
          )
        })}
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🃏</p>
          <p className="text-sm">{t("cards.noCards")}</p>
          <p className="text-xs mt-1">{t("cards.noCardsHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(card => {
            const style = RARITY_STYLES[card.rarity]
            return (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className="text-left"
              >
                <div className={`relative rounded-xl overflow-hidden border-2 ${style.border} ${style.glow} transition-all hover:scale-[1.02] active:scale-[0.98]`}>
                  {card.cardImage ? (
                    <img
                      src={card.cardImage}
                      alt={card.title}
                      className="w-full aspect-[3/4] object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                      <span className="text-4xl font-bold text-white/20">
                        {card.title.charAt(0)}
                      </span>
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2.5">
                    <h3 className="text-white font-semibold text-sm line-clamp-1">{card.title}</h3>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] text-white ${style.labelBg}`}>
                        {style.label}
                      </span>
                      {card.subtitle && (
                        <span className="text-white/60 text-[10px]">{card.subtitle}</span>
                      )}
                    </div>
                  </div>

                  {card.rarity !== "common" && (
                    <div className="absolute inset-0 pointer-events-none rounded-xl animate-shimmer" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Full-screen card view */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setSelectedCard(null)}
        >
          <div className="relative animate-card-float" onClick={e => e.stopPropagation()}>
            <div className={`relative w-[280px] rounded-2xl overflow-hidden border-4 ${RARITY_STYLES[selectedCard.rarity].border} ${RARITY_STYLES[selectedCard.rarity].glow}`}>
              {selectedCard.cardImage ? (
                <img
                  src={selectedCard.cardImage}
                  alt={selectedCard.title}
                  className="w-full aspect-[3/4] object-cover"
                />
              ) : (
                <div className="w-full aspect-[3/4] bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                  <span className="text-6xl font-bold text-white/20">
                    {selectedCard.title.charAt(0)}
                  </span>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <h3 className="text-white font-bold text-lg">{selectedCard.title}</h3>
                {selectedCard.subtitle && (
                  <p className="text-white/60 text-sm mt-0.5">{selectedCard.subtitle}</p>
                )}
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white mt-1 ${RARITY_STYLES[selectedCard.rarity].labelBg}`}>
                  {RARITY_STYLES[selectedCard.rarity].label}
                </span>
              </div>

              {selectedCard.rarity !== "common" && (
                <div className="absolute inset-0 pointer-events-none rounded-2xl animate-shimmer" />
              )}
              {selectedCard.rarity === "legendary" && (
                <div className="absolute inset-0 pointer-events-none rounded-2xl animate-holographic opacity-30 bg-gradient-to-br from-red-500 via-yellow-500 to-blue-500" />
              )}
            </div>

            <p
              className="text-center text-white/50 text-xs mt-4 cursor-pointer"
              onClick={() => setSelectedCard(null)}
            >
              {t("common.close")}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
