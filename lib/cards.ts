import { randomInt } from "crypto"

// Cryptographically secure random float in [0, 1)
function secureRandom(): number {
  return randomInt(0, 2_147_483_647) / 2_147_483_647
}

// 卡牌稀有度配置
export const CARD_RARITIES = {
  common: {
    name: "普通",
    color: "bg-gray-100 text-gray-700",
    borderColor: "border-gray-300",
    dropRate: 0.5, // 50%
    dotColor: "#9CA3AF",
  },
  rare: {
    name: "稀有",
    color: "bg-blue-100 text-blue-700",
    borderColor: "border-blue-400",
    dropRate: 0.3, // 30%
    dotColor: "#3B82F6",
  },
  epic: {
    name: "史诗",
    color: "bg-purple-100 text-purple-700",
    borderColor: "border-purple-400",
    dropRate: 0.15, // 15%
    dotColor: "#8B5CF6",
  },
  legendary: {
    name: "传说",
    color: "bg-orange-100 text-orange-700",
    borderColor: "border-orange-400",
    dropRate: 0.04, // 4%
    dotColor: "#F59E0B",
  },
  limited: {
    name: "限定",
    color: "bg-pink-100 text-pink-700",
    borderColor: "border-pink-400",
    dropRate: 0.01, // 1%
    dotColor: "#EC4899",
  },
} as const

export type CardRarity = keyof typeof CARD_RARITIES

// 根据掉率随机选择稀有度
export function getRandomRarity(): CardRarity {
  const rand = secureRandom()
  let cumulative = 0

  const rarities: CardRarity[] = [
    "common",
    "rare",
    "epic",
    "legendary",
    "limited",
  ]

  for (const rarity of rarities) {
    cumulative += CARD_RARITIES[rarity].dropRate
    if (rand < cumulative) {
      return rarity
    }
  }

  return "common" // fallback
}

// 检查是否触发卡牌掉落（观看完成率 > 80%）
export function shouldDropCard(completedRate: number): boolean {
  return completedRate > 0.8
}
