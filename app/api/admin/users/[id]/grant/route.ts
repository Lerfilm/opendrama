export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import { addTokens } from "@/lib/tokens"
import prisma from "@/lib/prisma"

async function checkAdmin() {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) return null
  return session
}

/**
 * POST /api/admin/users/[id]/grant — grant tokens to a user
 * Body: { amount: number, note?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await checkAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: userId } = await params
  const { amount, note } = (await req.json()) as { amount: number; note?: string }

  if (!amount || amount < 1 || amount > 100000) {
    return NextResponse.json({ error: "Amount must be 1-100000" }, { status: 400 })
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  })
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  await addTokens(userId, Math.floor(amount), "bonus", {
    grantedBy: session.user!.email,
    note: note || "Admin grant",
  })

  // Return updated balance
  const balance = await prisma.userBalance.findUnique({ where: { userId } })

  return NextResponse.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email },
    granted: Math.floor(amount),
    newBalance: balance?.balance ?? 0,
  })
}
