export const dynamic = "force-dynamic";
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
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
    console.error(e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
