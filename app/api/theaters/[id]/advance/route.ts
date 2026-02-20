export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { aiComplete, buildTheaterSystemPrompt } from "@/lib/ai"

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
    // 获取剧场和当前会话
    const theater = await prisma.theater.findFirst({
      where: { id, creatorId: session.user.id },
      include: {
        sessions: {
          orderBy: { sessionNum: "desc" },
          take: 1,
          include: {
            messages: { orderBy: { sortOrder: "asc" } },
            options: {
              include: { votes: true },
              orderBy: { voteCount: "desc" },
            },
          },
        },
      },
    })

    if (!theater) {
      return NextResponse.json({ error: "Theater not found or not owner" }, { status: 404 })
    }

    if (theater.status !== "live") {
      return NextResponse.json({ error: "Theater is not live" }, { status: 400 })
    }

    const currentSession = theater.sessions[0]
    if (!currentSession) {
      return NextResponse.json({ error: "No active session" }, { status: 400 })
    }

    // 获取投票结果
    const winningOption = currentSession.options[0] // 最高票数
    const scenario = theater.scenario || ""
    const characters = (() => {
      try {
        return JSON.parse(theater.characters || "[]")
      } catch {
        return []
      }
    })()

    // 构建对话历史
    const history = currentSession.messages.map((msg) => {
      if (msg.role === "narrator") {
        return `[旁白] ${msg.content}`
      }
      return `[${msg.character || "系统"}] ${msg.content}`
    }).join("\n")

    const systemPrompt = buildTheaterSystemPrompt(scenario, characters)

    const userPrompt = winningOption
      ? `观众选择了：「${winningOption.label}」(${winningOption.voteCount}票)\n${winningOption.description || ""}\n\n之前的剧情：\n${history}\n\n请继续推进剧情。`
      : `请开始第一幕的剧情。\n\n剧情设定：${scenario}`

    // 调用 AI
    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
      maxTokens: 4096,
      responseFormat: "json",
    })

    // 解析 AI 输出
    let parsed: {
      narrative?: string
      messages?: Array<{ role: string; character?: string; content: string }>
      voteOptions?: Array<{ label: string; description?: string }>
    }

    try {
      parsed = JSON.parse(result.content)
    } catch {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error("Failed to parse AI theater response")
      }
    }

    // 关闭当前会话，创建新会话
    const nextSessionNum = currentSession.sessionNum + 1

    await prisma.theaterSession.update({
      where: { id: currentSession.id },
      data: {
        status: "resolved",
        chosenOptionId: winningOption?.id || null,
      },
    })

    const newSession = await prisma.theaterSession.create({
      data: {
        theaterId: id,
        sessionNum: nextSessionNum,
        title: parsed.narrative || `第${nextSessionNum}幕`,
        narrative: parsed.narrative || "",
        status: "active",
        votingEndsAt: new Date(Date.now() + 5 * 60 * 1000), // 5 分钟投票时间
      },
    })

    // 创建消息
    const messages = parsed.messages || []
    await Promise.all(
      messages.map((msg, i) =>
        prisma.theaterMessage.create({
          data: {
            theaterId: id,
            sessionId: newSession.id,
            role: msg.role || "narrator",
            character: msg.character || null,
            content: msg.content,
            messageType: msg.role === "narrator" ? "narration" : "dialogue",
            sortOrder: i,
          },
        })
      )
    )

    // 创建投票选项
    const voteOptions = parsed.voteOptions || []
    await Promise.all(
      voteOptions.map((opt, i) =>
        prisma.theaterVoteOption.create({
          data: {
            sessionId: newSession.id,
            label: opt.label,
            description: opt.description || null,
            sortOrder: i,
          },
        })
      )
    )

    // 更新会话状态为投票中
    await prisma.theaterSession.update({
      where: { id: newSession.id },
      data: { status: "voting" },
    })

    return NextResponse.json({
      sessionId: newSession.id,
      sessionNum: nextSessionNum,
      narrative: parsed.narrative,
      messagesCreated: messages.length,
      voteOptionsCreated: voteOptions.length,
      model: result.model,
    })
  } catch (error) {
    console.error("Theater advance error:", error)
    return NextResponse.json(
      { error: "Failed to advance theater" },
      { status: 500 }
    )
  }
}
