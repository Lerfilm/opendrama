import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY")
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover",
  typescript: true,
})

// Coin top-up packages (USD)
export const COIN_PACKAGES = [
  {
    id: "package_60",
    coins: 60,
    price: 99, // $0.99
    name: "Starter Pack",
    description: "60 coins",
    popular: false,
  },
  {
    id: "package_300",
    coins: 300,
    price: 499, // $4.99
    name: "Value Pack",
    description: "300 coins",
    popular: true,
  },
  {
    id: "package_1000",
    coins: 1000,
    price: 1499, // $14.99
    name: "Premium Pack",
    description: "1000 coins",
    popular: false,
  },
  {
    id: "package_2000",
    coins: 2000,
    price: 2999, // $29.99
    name: "Ultimate Pack",
    description: "2000 coins",
    popular: false,
  },
] as const

export type CoinPackage = (typeof COIN_PACKAGES)[number]
