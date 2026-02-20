export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

// 更新卡片
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    requireAdmin(session.user.email)
    const { id } = await params
    const body = await req.json()

    const card = await prisma.card.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.rarity !== undefined && { rarity: body.rarity }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.seriesId !== undefined && { seriesId: body.seriesId }),
      },
    })

    return NextResponse.json({ card })
  } catch (error) {
    console.error("Failed to update card:", error)
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 })
  }
}

// 删除卡片
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    requireAdmin(session.user.email)
    const { id } = await params

    await prisma.card.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete card:", error)
    return NextResponse.json({ error: "Failed to delete card" }, { status: 500 })
  }
}
