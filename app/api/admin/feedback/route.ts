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
 * GET /api/admin/feedback — list feedback with summary
 * Query: ?status=new&page=1&limit=20
 */
export async function GET(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || ""
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")))
  const skip = (page - 1) * limit

  const where = status && status !== "all" ? { status } : {}

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [items, total, newCount, pendingCount, todayCount] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.feedback.count({ where }),
    prisma.feedback.count({ where: { status: "new" } }),
    prisma.feedback.count({ where: { status: { in: ["new", "read"] } } }),
    prisma.feedback.count({ where: { createdAt: { gte: today } } }),
  ])

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    summary: { newCount, pendingCount, todayCount },
  })
}

/**
 * PATCH /api/admin/feedback — update feedback status/note
 * Body: { id: string, status?: string, adminNote?: string }
 */
export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, status, adminNote } = (await req.json()) as {
    id: string
    status?: string
    adminNote?: string
  }

  if (!id) {
    return NextResponse.json({ error: "Feedback id required" }, { status: 400 })
  }

  const validStatuses = ["new", "read", "resolved"]
  const data: { status?: string; adminNote?: string } = {}
  if (status && validStatuses.includes(status)) data.status = status
  if (typeof adminNote === "string") data.adminNote = adminNote

  const updated = await prisma.feedback.update({ where: { id }, data })

  return NextResponse.json({ feedback: updated })
}
