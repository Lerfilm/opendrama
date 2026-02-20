export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// 获取剧场列表
export async function GET() {
  try {
    const theaters = await prisma.theater.findMany({
      where: { isPublic: true },
      include: {
        creator: { select: { name: true, image: true } },
        _count: { select: { votes: true, sessions: true } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 30,
    })

    return NextResponse.json({ theaters })
  } catch (error) {
    console.error("Failed to fetch theaters:", error)
    return NextResponse.json({ error: "Failed to fetch theaters" }, { status: 500 })
  }
}

// 创建剧场
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { title, description, genre, scenario, characters } = await req.json()

    if (!title?.trim() || !scenario?.trim()) {
      return NextResponse.json(
        { error: "Title and scenario are required" },
        { status: 400 }
      )
    }

    const theater = await prisma.theater.create({
      data: {
        creatorId: session.user.id,
        title: title.trim(),
        description: description?.trim() || null,
        genre: genre || "drama",
        scenario: JSON.stringify({ text: scenario.trim() }),
        characters: characters
          ? JSON.stringify(
              characters
                .filter((c: { name: string }) => c.name.trim())
                .map((c: { name: string; personality: string }) => ({
                  name: c.name.trim(),
                  personality: c.personality?.trim() || "",
                }))
            )
          : null,
        status: "draft",
      },
    })

    // 创建第一幕
    await prisma.theaterSession.create({
      data: {
        theaterId: theater.id,
        sessionNum: 1,
        title: "序幕",
        status: "active",
      },
    })

    return NextResponse.json({ theater })
  } catch (error) {
    console.error("Failed to create theater:", error)
    return NextResponse.json(
      { error: "Failed to create theater" },
      { status: 500 }
    )
  }
}
