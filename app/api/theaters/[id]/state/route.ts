export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

/**
 * 获取剧场最新状态（用于轮询更新）
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const theater = await prisma.theater.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        genre: true,
        scenario: true,
        characters: true,
        totalVotes: true,
        creator: {
          select: { id: true, name: true, image: true },
        },
        sessions: {
          orderBy: { sessionNum: "asc" },
          select: {
            id: true,
            sessionNum: true,
            title: true,
            narrative: true,
            status: true,
            votingEndsAt: true,
            messages: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                role: true,
                character: true,
                content: true,
                messageType: true,
              },
            },
            options: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                label: true,
                description: true,
                voteCount: true,
                _count: { select: { votes: true } },
              },
            },
          },
        },
      },
    })

    if (!theater) {
      return NextResponse.json({ error: "Theater not found" }, { status: 404 })
    }

    return NextResponse.json({ theater })
  } catch (error) {
    console.error("Theater state error:", error)
    return NextResponse.json(
      { error: "Failed to get theater state" },
      { status: 500 }
    )
  }
}
