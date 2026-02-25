import prisma from "@/lib/prisma"
import { MODEL_PRICING } from "@/lib/model-pricing"

// Re-export so existing server-side imports still work
export { MODEL_PRICING } from "@/lib/model-pricing"

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
 * Use this ONLY when tokens were previously reserved via reserveTokens().
 * For direct charges (AI features), use directDeduction() instead.
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

    // Sync legacy User.coins field
    await tx.user.update({
      where: { id: userId },
      data: { coins: balance.balance },
    })
  })
}

/**
 * Direct deduction — charge coins without a prior reservation.
 * Used for AI features where we check balance and deduct in one atomic step.
 * Returns true if charged, false if insufficient balance.
 */
export async function directDeduction(
  userId: string,
  amount: number,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    const current = await tx.userBalance.findUnique({ where: { userId } })
    if (!current || current.balance - current.reserved < amount) return false

    const updated = await tx.userBalance.update({
      where: { userId },
      data: {
        balance: { decrement: amount },
        totalConsumed: { increment: amount },
      },
    })

    await tx.tokenTransaction.create({
      data: {
        userId,
        type: "consume",
        amount: -amount,
        balanceAfter: updated.balance,
        description: `Consumed ${amount} coins`,
        metadata: metadata as any,
      },
    })

    // Sync legacy User.coins field
    await tx.user.update({
      where: { id: userId },
      data: { coins: updated.balance },
    })

    return true
  })
}

/**
 * Refund reserved tokens after failed generation.
 * Clamps to actual reserved amount to prevent negative values from double-refunds.
 */
export async function refundReservation(userId: string, amount: number, description?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Read current state first to prevent over-releasing
    const current = await tx.userBalance.findUnique({
      where: { userId },
      select: { reserved: true, balance: true },
    })
    if (!current) return

    // Only release what is actually still reserved (clamp to [0, reserved])
    const actualRelease = Math.min(amount, Math.max(current.reserved, 0))
    if (actualRelease <= 0) {
      console.warn(`[Tokens] refundReservation skipped (reserved=${current.reserved}, requested=${amount})`)
      return
    }

    const balance = await tx.userBalance.update({
      where: { userId },
      data: { reserved: { decrement: actualRelease } },
    })

    await tx.tokenTransaction.create({
      data: {
        userId,
        type: "release",
        amount: actualRelease,
        balanceAfter: balance.balance,
        description: description || `Released ${actualRelease} reserved coins`,
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
