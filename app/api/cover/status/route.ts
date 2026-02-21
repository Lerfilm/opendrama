export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { queryCoverResult } from "@/lib/cover-generation"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const scriptId = searchParams.get("scriptId")
  const tallTaskId = searchParams.get("tallTaskId")

  if (!scriptId) {
    return NextResponse.json({ error: "scriptId is required" }, { status: 400 })
  }

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { coverTall: true, coverImage: true },
  })

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 })
  }

  // If task ID is provided, query live status from provider
  if (tallTaskId) {
    const tallResult = await queryCoverResult(tallTaskId).catch(() => ({ status: "failed" as const }))

    const allDone = tallResult.status === "done"
    const anyFailed = tallResult.status === "failed"

    // Re-fetch to get saved URLs after background poller writes them
    const freshScript = allDone
      ? await prisma.script.findFirst({
          where: { id: scriptId },
          select: { coverTall: true, coverImage: true },
        })
      : null

    return NextResponse.json({
      status: anyFailed ? "failed" : allDone ? "done" : "generating",
      tallStatus: tallResult.status,
      coverTall: freshScript?.coverTall ?? script.coverTall,
      coverImage: freshScript?.coverImage ?? script.coverImage,
    })
  }

  // Simple status check — just return saved covers
  return NextResponse.json({
    coverTall: script.coverTall,
    coverImage: script.coverImage,
    status: script.coverTall ? "done" : "idle",
  })
}
