export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id: theaterId } = await params
    const { optionId } = await req.json()

    if (!optionId) {
      return NextResponse.json({ error: "optionId is required" }, { status: 400 })
    }

    // 验证选项存在且属于该剧场
    const option = await prisma.theaterVoteOption.findFirst({
      where: { id: optionId },
      include: { session: { select: { theaterId: true } } },
    })

    if (!option || option.session.theaterId !== theaterId) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 })
    }

    // 检查是否已投票
    const existing = await prisma.theaterVote.findUnique({
      where: {
        userId_optionId: {
          userId: session.user.id,
          optionId,
        },
      },
    })

    if (existing) {
      return NextResponse.json({ error: "Already voted" }, { status: 409 })
    }

    // 投票 + 增加计数（原子操作）
    await prisma.$transaction([
      prisma.theaterVote.create({
        data: {
          theaterId,
          optionId,
          userId: session.user.id,
        },
      }),
      prisma.theaterVoteOption.update({
        where: { id: optionId },
        data: { voteCount: { increment: 1 } },
      }),
      prisma.theater.update({
        where: { id: theaterId },
        data: { totalVotes: { increment: 1 } },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Vote error:", error)
    return NextResponse.json({ error: "Failed to vote" }, { status: 500 })
  }
}
