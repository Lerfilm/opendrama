export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

// 获取单个系列详情
export async function GET(
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

    const series = await prisma.series.findUnique({
      where: { id },
      include: {
        episodes: { orderBy: { episodeNum: "asc" } },
        cards: true,
        _count: { select: { episodes: true, cards: true } },
      },
    })

    if (!series) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ series })
  } catch (error) {
    console.error("Failed to fetch series:", error)
    return NextResponse.json({ error: "Failed to fetch series" }, { status: 500 })
  }
}

// 更新系列
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
    const { title, description, coverUrl, status } = await req.json()

    const series = await prisma.series.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(coverUrl !== undefined && { coverUrl }),
        ...(status !== undefined && { status }),
      },
    })

    return NextResponse.json({ series })
  } catch (error) {
    console.error("Failed to update series:", error)
    return NextResponse.json({ error: "Failed to update series" }, { status: 500 })
  }
}

// 删除系列
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

    await prisma.series.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete series:", error)
    return NextResponse.json({ error: "Failed to delete series" }, { status: 500 })
  }
}
