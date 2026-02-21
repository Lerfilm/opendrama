export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET: paginated comments
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: seriesId } = await params
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get("page") || "1")
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)
  const skip = (page - 1) * limit

  try {
    const [comments, total] = await Promise.all([
      prisma.seriesComment.findMany({
        where: { seriesId },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.seriesComment.count({ where: { seriesId } }),
    ])

    return NextResponse.json({
      comments,
      total,
      page,
      hasMore: skip + comments.length < total,
    })
  } catch (error) {
    console.error("Get comments error:", error)
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 })
  }
}

// POST: create comment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: seriesId } = await params

  try {
    const { content } = await req.json()

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 })
    }

    if (content.length > 500) {
      return NextResponse.json({ error: "Comment too long (max 500)" }, { status: 400 })
    }

    const comment = await prisma.seriesComment.create({
      data: {
        seriesId,
        userId: session.user.id,
        content: content.trim(),
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    })

    const total = await prisma.seriesComment.count({ where: { seriesId } })

    return NextResponse.json({ comment, total })
  } catch (error) {
    console.error("Post comment error:", error)
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 })
  }
}
