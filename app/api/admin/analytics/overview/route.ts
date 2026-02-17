import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    requireAdmin(session?.user?.email)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [totalUsers, todayNewUsers, totalRevenue, totalWatchDuration] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.purchase.aggregate({
          where: { status: "completed" },
          _sum: { amount: true },
        }),
        prisma.watchEvent.aggregate({
          _sum: { watchDuration: true },
        }),
      ])

    return NextResponse.json({
      totalUsers,
      todayNewUsers,
      totalRevenue: totalRevenue._sum.amount ?? 0,
      totalWatchDuration: totalWatchDuration._sum.watchDuration ?? 0,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }
}
