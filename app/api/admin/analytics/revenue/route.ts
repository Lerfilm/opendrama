export const dynamic = "force-dynamic";
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    requireAdmin(session?.user?.email)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    // Daily revenue
    const dailyRevenue = await prisma.$queryRaw<
      { date: string; total: bigint }[]
    >`
      SELECT DATE("createdAt") as date, SUM(amount)::bigint as total
      FROM purchases
      WHERE status = 'completed' AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `

    // ARPU (total revenue / total users who paid)
    const [totalRevenue, payingUsers, totalUsers] = await Promise.all([
      prisma.purchase.aggregate({
        where: { status: "completed" },
        _sum: { amount: true },
      }),
      prisma.purchase.groupBy({
        by: ["userId"],
        where: { status: "completed" },
      }),
      prisma.user.count(),
    ])

    // Coin spending: unlocks vs recharges
    const [totalUnlockSpend, totalRechargeCoins] = await Promise.all([
      prisma.episodeUnlock.aggregate({ _sum: { coinsCost: true } }),
      prisma.purchase.aggregate({
        where: { status: "completed" },
        _sum: { coins: true },
      }),
    ])

    return NextResponse.json({
      dailyRevenue: dailyRevenue.map((r) => ({
        date: String(r.date).slice(0, 10),
        total: Number(r.total),
      })),
      arpu:
        totalUsers > 0
          ? Math.round((totalRevenue._sum.amount ?? 0) / totalUsers)
          : 0,
      arppu:
        payingUsers.length > 0
          ? Math.round(
              (totalRevenue._sum.amount ?? 0) / payingUsers.length
            )
          : 0,
      coinSpending: {
        unlocks: totalUnlockSpend._sum.coinsCost ?? 0,
        recharges: totalRechargeCoins._sum.coins ?? 0,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }
}
