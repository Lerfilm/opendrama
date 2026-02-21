export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * 发布剧本为系列剧集
 * 将已完成的剧本转化为 Series + Episodes
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    // 获取剧本及其场景和角色
    const script = await prisma.script.findFirst({
      where: { id, userId: session.user.id },
      include: {
        scenes: { orderBy: { sortOrder: "asc" } },
        roles: true,
      },
    })

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    if (script.status !== "completed") {
      return NextResponse.json(
        { error: "Script must be completed before publishing" },
        { status: 400 }
      )
    }

    const { title, coverUrl, description, unlockCost } = await req.json()

    // 按集数分组场景
    const episodeMap = new Map<number, typeof script.scenes>()
    for (const scene of script.scenes) {
      const ep = scene.episodeNum
      if (!episodeMap.has(ep)) episodeMap.set(ep, [])
      episodeMap.get(ep)!.push(scene)
    }

    // 创建系列
    const series = await prisma.series.create({
      data: {
        title: title || script.title,
        description: description || script.logline || script.synopsis || "",
        coverUrl: coverUrl || null,
        status: "active",
      },
    })

    // 为每一集创建 Episode
    const episodes = []
    for (const [episodeNum, scenes] of episodeMap) {
      const totalDuration = scenes.reduce((acc, s) => acc + (s.duration || 60), 0)
      const firstScene = scenes[0]

      const episode = await prisma.episode.create({
        data: {
          seriesId: series.id,
          episodeNum,
          title: firstScene?.heading || `第${episodeNum}集`,
          description: scenes.map((s) => s.action).filter(Boolean).join("\n"),
          duration: totalDuration,
          unlockCost: episodeNum <= 5 ? 0 : (unlockCost || 10), // 前5集免费
          status: "active",
        },
      })
      episodes.push(episode)
    }

    // 更新剧本状态
    await prisma.script.update({
      where: { id },
      data: {
        status: "published",
        metadata: JSON.stringify({
          ...(script.metadata ? JSON.parse(script.metadata) : {}),
          publishedSeriesId: series.id,
          publishedAt: new Date().toISOString(),
        }),
      },
    })

    return NextResponse.json({
      seriesId: series.id,
      episodesCreated: episodes.length,
      message: "Script published as series successfully",
    })
  } catch (error) {
    console.error("Publish script error:", error)
    return NextResponse.json(
      { error: "Failed to publish script" },
      { status: 500 }
    )
  }
}
