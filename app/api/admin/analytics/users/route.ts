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
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    // Daily registrations (raw SQL for date grouping)
    const dailyRegistrations = await prisma.$queryRaw<
      { date: string; count: bigint }[]
    >`
      SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
      FROM users
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `

    // Daily active users (users with watch events)
    const dailyActive = await prisma.$queryRaw<
      { date: string; count: bigint }[]
    >`
      SELECT DATE("createdAt") as date, COUNT(DISTINCT "userId")::bigint as count
      FROM watch_events
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `

    return NextResponse.json({
      dailyRegistrations: dailyRegistrations.map((r) => ({
        date: String(r.date).slice(0, 10),
        count: Number(r.count),
      })),
      dailyActive: dailyActive.map((r) => ({
        date: String(r.date).slice(0, 10),
        count: Number(r.count),
      })),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
