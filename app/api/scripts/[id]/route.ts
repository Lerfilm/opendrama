export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// 获取剧本详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const script = await prisma.script.findFirst({
      where: { id, userId: session.user.id },
      include: {
        scenes: { orderBy: [{ episodeNum: "asc" }, { sortOrder: "asc" }] },
        roles: { orderBy: { createdAt: "asc" } },
        videoSegments: {
          orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
          select: {
            id: true, episodeNum: true, segmentIndex: true,
            durationSec: true, prompt: true, shotType: true,
            cameraMove: true, model: true, resolution: true, status: true,
          },
        },
        jobs: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    })

    if (!script) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ script })
  } catch (error) {
    console.error("Failed to fetch script:", error)
    return NextResponse.json({ error: "Failed to fetch script" }, { status: 500 })
  }
}

// 更新剧本
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await req.json()

    // 验证所有权
    const existing = await prisma.script.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const script = await prisma.script.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.genre !== undefined && { genre: body.genre }),
        ...(body.format !== undefined && { format: body.format }),
        ...(body.language !== undefined && { language: body.language }),
        ...(body.logline !== undefined && { logline: body.logline }),
        ...(body.synopsis !== undefined && { synopsis: body.synopsis }),
        ...(body.targetEpisodes !== undefined && { targetEpisodes: body.targetEpisodes }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.metadata !== undefined && { metadata: body.metadata }),
      },
    })

    return NextResponse.json({ script })
  } catch (error) {
    console.error("Failed to update script:", error)
    return NextResponse.json({ error: "Failed to update script" }, { status: 500 })
  }
}

// 删除剧本
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params

    const existing = await prisma.script.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await prisma.script.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete script:", error)
    return NextResponse.json({ error: "Failed to delete script" }, { status: 500 })
  }
}
