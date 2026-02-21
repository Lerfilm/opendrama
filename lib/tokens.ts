import prisma from "@/lib/prisma"

// Model pricing table (API cost per second in cents USD)
export const MODEL_PRICING: Record<string, Record<string, number>> = {
  seedance_2_0:     { "1080p": 80, "720p": 40 },
  seedance_1_5_pro: { "1080p": 100, "720p": 50 },
  jimeng_3_0_pro:   { "1080p": 100 },
  jimeng_3_0:       { "1080p": 63, "720p": 28 },
  jimeng_s2_pro:    { "720p": 65 },
}

/**
 * Calculate token cost for video generation.
 * User price = API cost x 2, converted to coins (1 coin = 1 cent USD).
 */
export function calculateTokenCost(model: string, resolution: string, durationSec: number): number {
  const costPerSec = MODEL_PRICING[model]?.[resolution]
  if (!costPerSec) throw new Error(`Unknown model/resolution: ${model}/${resolution}`)
  const apiCostCents = costPerSec * durationSec
  const userCostCents = apiCostCents * 2
  return Math.ceil(userCostCents / 100) // convert to coins (round up)
}

/**
 * Get user's available balance (balance - reserved).
 */
export async function getAvailableBalance(userId: string): Promise<number> {
  const balance = await prisma.userBalance.findUnique({ where: { userId } })
  if (!balance) return 0
  return balance.balance - balance.reserved
}

/**
 * Reserve tokens before video generation.
 * Returns true if reservation succeeded, false if insufficient balance.
 */
export async function reserveTokens(userId: string, amount: number, description?: string): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    const balance = await tx.userBalance.findUnique({ where: { userId } })
    if (!balance || balance.balance - balance.reserved < amount) return false

    await tx.userBalance.update({
      where: { userId },
      data: { reserved: { increment: amount } },
    })

    await tx.tokenTransaction.create({
      data: {
        userId,
        type: "reserve",
        amount: -amount,
        balanceAfter: balance.balance,
        description: description || `Reserved ${amount} coins`,
      },
    })
    return true
  })
}

/**
 * Confirm deduction after successful generation.
 */
export async function confirmDeduction(
  userId: string,
  amount: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.userBalance.update({
      where: { userId },
      data: {
        balance: { decrement: amount },
        reserved: { decrement: amount },
        totalConsumed: { increment: amount },
      },
    })

    await tx.tokenTransaction.create({
      data: {
        userId,
        type: "consume",
        amount: -amount,
        balanceAfter: balance.balance,
        description: `Consumed ${amount} coins`,
        metadata: metadata as any,
      },
    })
  })
}

/**
 * Refund reserved tokens after failed generation.
 */
export async function refundReservation(userId: string, amount: number, description?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.userBalance.update({
      where: { userId },
      data: { reserved: { decrement: amount } },
    })

    await tx.tokenTransaction.create({
      data: {
        userId,
        type: "release",
        amount,
        balanceAfter: balance.balance,
        description: description || `Released ${amount} reserved coins`,
      },
    })
  })
}

/**
 * Add tokens to user balance (called from Stripe webhook or bonus).
 */
export async function addTokens(
  userId: string,
  amount: number,
  type: "purchase" | "bonus" = "purchase",
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.userBalance.upsert({
      where: { userId },
      create: { userId, balance: amount, totalPurchased: amount },
      update: {
        balance: { increment: amount },
        totalPurchased: { increment: amount },
      },
    })

    await tx.tokenTransaction.create({
      data: {
        userId,
        type,
        amount,
        balanceAfter: balance.balance,
        description: type === "purchase" ? `Purchased ${amount} coins` : `Bonus ${amount} coins`,
        metadata: metadata as any,
      },
    })

    // Also update the legacy User.coins field for backward compatibility
    await tx.user.update({
      where: { id: userId },
      data: { coins: balance.balance },
    })
  })
}
