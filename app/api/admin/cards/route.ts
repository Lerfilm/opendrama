export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const cards = await prisma.card.findMany({
      include: { series: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ cards })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
