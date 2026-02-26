"use client"

import { useEffect, useState } from "react"
import { t } from "@/lib/i18n"

interface AchievementAnimationProps {
  show: boolean
  card: {
    cardImage: string
    title: string
    rarity: "common" | "rare" | "epic" | "legendary"
  }
  onClose: () => void
}

const RARITY_STYLES = {
  common: {
    border: "border-gray-300",
    glow: "shadow-[0_0_30px_rgba(200,200,200,0.5)]",
    labelKey: "rarity.common",
    labelBg: "bg-gray-500",
  },
  rare: {
    border: "border-blue-400",
    glow: "shadow-[0_0_40px_rgba(59,130,246,0.6)]",
    labelKey: "rarity.rare",
    labelBg: "bg-blue-500",
  },
  epic: {
    border: "border-purple-500",
    glow: "shadow-[0_0_50px_rgba(168,85,247,0.7)]",
    labelKey: "rarity.epic",
    labelBg: "bg-purple-600",
  },
  legendary: {
    border: "border-yellow-400",
    glow: "shadow-[0_0_60px_rgba(250,204,21,0.8)]",
    labelKey: "rarity.legendary",
    labelBg: "bg-gradient-to-r from-yellow-500 to-amber-500",
  },
}

export function AchievementAnimation({ show, card, onClose }: AchievementAnimationProps) {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0)
  const style = RARITY_STYLES[card.rarity]

  useEffect(() => {
    if (!show) {
      setPhase(0)
      return
    }

    // Phase 1: backdrop appears (0-0.5s)
    setPhase(1)
    const t1 = setTimeout(() => setPhase(2), 800) // Phase 2: card flip in (0.8s)
    const t2 = setTimeout(() => setPhase(3), 1800) // Phase 3: text reveal (1.8s)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [show])

  if (!show) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
      onClick={onClose}
    >
      {/* Dark backdrop */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-500 ${
          phase >= 1 ? "opacity-70" : "opacity-0"
        }`}
      />

      {/* Particle burst effect */}
      {phase >= 1 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-white/60 animate-particle"
              style={{
                left: "50%",
                top: "50%",
                animationDelay: `${i * 0.05}s`,
                "--angle": `${(i * 18)}deg`,
                "--distance": `${100 + Math.random() * 150}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Card */}
      <div
        className={`relative z-10 transition-all ${
          phase >= 2
            ? "scale-100 opacity-100"
            : "scale-0 opacity-0"
        }`}
        style={{
          transitionDuration: "0.8s",
          transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
          perspective: "1000px",
        }}
      >
        <div
          className={`relative w-[260px] sm:w-[280px] rounded-2xl overflow-hidden border-4 ${style.border} ${style.glow}`}
          style={{
            animation: phase >= 2 ? "cardFlipIn 0.8s ease-out" : undefined,
          }}
        >
          {/* Card image */}
          {card.cardImage ? (
            <img
              src={card.cardImage}
              alt={card.title}
              className="w-full aspect-[3/4] object-cover"
            />
          ) : (
            <div className="w-full aspect-[3/4] bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
              <span className="text-6xl font-bold text-white/20">
                {card.title.charAt(0)}
              </span>
            </div>
          )}

          {/* Bottom info bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <h3 className="text-white font-bold text-lg">{card.title}</h3>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white mt-1 ${style.labelBg}`}>
              {t(style.labelKey)}
            </span>
          </div>

          {/* Shimmer overlay for rare+ */}
          {card.rarity !== "common" && (
            <div className="absolute inset-0 pointer-events-none rounded-2xl animate-shimmer" />
          )}

          {/* Holographic effect for legendary */}
          {card.rarity === "legendary" && (
            <div className="absolute inset-0 pointer-events-none rounded-2xl animate-holographic opacity-30 bg-gradient-to-br from-red-500 via-yellow-500 to-blue-500" />
          )}
        </div>

        {/* Achievement text */}
        <div
          className={`text-center mt-6 transition-all duration-500 ${
            phase >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <p className="text-white text-lg font-bold">
            {t("cards.newCard")}
          </p>
          <p className="text-white/60 text-sm mt-1">
            {t("cards.tapToCollect")}
          </p>
        </div>
      </div>
    </div>
  )
}
