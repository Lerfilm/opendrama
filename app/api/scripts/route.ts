export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// 获取用户的剧本列表
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const scripts = await prisma.script.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { scenes: true, roles: true } },
      },
    })

    return NextResponse.json({ scripts })
  } catch (error) {
    console.error("Failed to fetch scripts:", error)
    return NextResponse.json({ error: "Failed to fetch scripts" }, { status: 500 })
  }
}

// 创建新剧本
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { title, genre, format, logline, synopsis, targetEpisodes, language } = await req.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    const script = await prisma.script.create({
      data: {
        userId: session.user.id,
        title: title.trim(),
        genre: genre || "drama",
        format: format || "shortdrama",
        logline: logline?.trim() || null,
        synopsis: synopsis?.trim() || null,
        targetEpisodes: targetEpisodes || 10,
        language: language || "zh",
      },
    })

    return NextResponse.json({ script })
  } catch (error) {
    console.error("Failed to create script:", error)
    return NextResponse.json({ error: "Failed to create script" }, { status: 500 })
  }
}
