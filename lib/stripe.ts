import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY")
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
})

// 金币充值套餐
export const COIN_PACKAGES = [
  {
    id: "package_60",
    coins: 60,
    price: 600, // 6元 = 600分
    name: "入门套餐",
    description: "60 金币",
    popular: false,
  },
  {
    id: "package_300",
    coins: 300,
    price: 3000, // 30元
    name: "超值套餐",
    description: "300 金币",
    popular: true,
  },
  {
    id: "package_1000",
    coins: 1000,
    price: 9800, // 98元
    name: "豪华套餐",
    description: "1000 金币",
    popular: false,
  },
  {
    id: "package_2000",
    coins: 2000,
    price: 19800, // 198元
    name: "至尊套餐",
    description: "2000 金币",
    popular: false,
  },
] as const

export type CoinPackage = (typeof COIN_PACKAGES)[number]
