export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

// 更新单集
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

    const episode = await prisma.episode.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.episodeNum !== undefined && { episodeNum: body.episodeNum }),
        ...(body.muxPlaybackId !== undefined && { muxPlaybackId: body.muxPlaybackId }),
        ...(body.muxAssetId !== undefined && { muxAssetId: body.muxAssetId }),
        ...(body.duration !== undefined && { duration: body.duration }),
        ...(body.unlockCost !== undefined && { unlockCost: body.unlockCost }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.thumbnailUrl !== undefined && { thumbnailUrl: body.thumbnailUrl }),
      },
    })

    return NextResponse.json({ episode })
  } catch (error) {
    console.error("Failed to update episode:", error)
    return NextResponse.json({ error: "Failed to update episode" }, { status: 500 })
  }
}

// 删除单集
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

    await prisma.episode.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete episode:", error)
    return NextResponse.json({ error: "Failed to delete episode" }, { status: 500 })
  }
}
