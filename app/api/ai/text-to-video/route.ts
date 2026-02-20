export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

const COST_PER_VIDEO = 10

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { prompt, negativePrompt, style, aspectRatio, duration } = await req.json()

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    // 检查金币余额
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { coins: true },
    })

    if (!user || user.coins < COST_PER_VIDEO) {
      return NextResponse.json(
        { error: "Insufficient coins" },
        { status: 402 }
      )
    }

    // 扣除金币 + 创建 AI 任务（原子操作）
    const [, job] = await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { coins: { decrement: COST_PER_VIDEO } },
      }),
      prisma.aIJob.create({
        data: {
          userId: session.user.id,
          type: "text_to_video",
          status: "pending",
          cost: COST_PER_VIDEO,
          input: JSON.stringify({
            prompt: prompt.trim(),
            negativePrompt: negativePrompt?.trim() || "",
            style: style || "auto",
            aspectRatio: aspectRatio || "9:16",
            duration: duration || 5,
          }),
        },
      }),
    ])

    // TODO: 调用 Volcengine Seed Dance API
    // 这里需要异步调用视频生成 API，然后通过 webhook 或轮询更新任务状态
    // 暂时模拟：标记为 processing
    await prisma.aIJob.update({
      where: { id: job.id },
      data: {
        status: "processing",
        startedAt: new Date(),
      },
    })

    // 模拟生成完成（生产环境中应该是异步回调）
    setTimeout(async () => {
      try {
        await prisma.aIJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            progress: 100,
            output: JSON.stringify({
              videoUrl: null, // 实际 URL 由 Seed Dance API 返回
              thumbnailUrl: null,
              message: "Placeholder - connect Volcengine Seed Dance API",
            }),
          },
        })
      } catch {
        // ignore cleanup errors
      }
    }, 5000)

    return NextResponse.json({
      jobId: job.id,
      status: "processing",
      message: "Video generation started",
    })
  } catch (error) {
    console.error("Text-to-video error:", error)
    return NextResponse.json(
      { error: "Failed to start video generation" },
      { status: 500 }
    )
  }
}
