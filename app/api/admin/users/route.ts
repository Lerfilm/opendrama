export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

async function checkAdmin() {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) return null
  return session
}

/**
 * GET /api/admin/users — search users with balance info
 * Query: ?q=search&page=1&limit=20
 */
export async function GET(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() || ""
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")))
  const skip = (page - 1) * limit

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {}

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        balance: {
          select: {
            balance: true,
            reserved: true,
            totalPurchased: true,
            totalConsumed: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      availableBalance: (u.balance?.balance ?? 0) - (u.balance?.reserved ?? 0),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
