import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

// GET: Fetch all danmaku for an episode
export async function GET(req: NextRequest) {
  const episodeId = req.nextUrl.searchParams.get("episodeId")
  if (!episodeId) {
    return NextResponse.json({ error: "Missing episodeId" }, { status: 400 })
  }

  const danmakus = await prisma.danmaku.findMany({
    where: { episodeId },
    orderBy: { timestamp: "asc" },
    select: {
      id: true,
      content: true,
      timestamp: true,
      color: true,
      user: { select: { name: true } },
    },
  })

  return NextResponse.json({ danmakus })
}

// POST: Send a danmaku
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { episodeId, content, timestamp, color } = body

  if (!episodeId || !content || timestamp === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // Validate content length
  if (content.length > 100) {
    return NextResponse.json({ error: "Content too long (max 100 chars)" }, { status: 400 })
  }

  const danmaku = await prisma.danmaku.create({
    data: {
      episodeId,
      userId: session.user.id,
      content: content.trim(),
      timestamp: Number(timestamp),
      color: color || "#FFFFFF",
    },
    select: {
      id: true,
      content: true,
      timestamp: true,
      color: true,
      user: { select: { name: true } },
    },
  })

  return NextResponse.json({ danmaku })
}
