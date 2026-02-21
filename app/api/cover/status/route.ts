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
  const wideTaskId = searchParams.get("wideTaskId")
  const tallTaskId = searchParams.get("tallTaskId")

  if (!scriptId) {
    return NextResponse.json({ error: "scriptId is required" }, { status: 400 })
  }

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { coverWide: true, coverTall: true, coverImage: true },
  })

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 })
  }

  // If task IDs are provided, query live status from provider
  if (wideTaskId || tallTaskId) {
    const [wideResult, tallResult] = await Promise.all([
      wideTaskId ? queryCoverResult(wideTaskId).catch(() => ({ status: "failed" as const })) : Promise.resolve({ status: "skipped" as const }),
      tallTaskId ? queryCoverResult(tallTaskId).catch(() => ({ status: "failed" as const })) : Promise.resolve({ status: "skipped" as const }),
    ])

    const wideDone = wideResult.status === "done" || wideResult.status === "skipped"
    const tallDone = tallResult.status === "done" || tallResult.status === "skipped"
    const anyFailed = wideResult.status === "failed" || tallResult.status === "failed"
    const allDone = wideDone && tallDone

    // Re-fetch to get saved URLs after background poller writes them
    const freshScript = allDone
      ? await prisma.script.findFirst({
          where: { id: scriptId },
          select: { coverWide: true, coverTall: true, coverImage: true },
        })
      : null

    return NextResponse.json({
      status: anyFailed ? "failed" : allDone ? "done" : "generating",
      wideStatus: wideResult.status,
      tallStatus: tallResult.status,
      coverWide: freshScript?.coverWide ?? script.coverWide,
      coverTall: freshScript?.coverTall ?? script.coverTall,
      coverImage: freshScript?.coverImage ?? script.coverImage,
    })
  }

  // Simple status check — just return saved covers
  return NextResponse.json({
    coverWide: script.coverWide,
    coverTall: script.coverTall,
    coverImage: script.coverImage,
    status: (script.coverWide || script.coverTall) ? "done" : "idle",
  })
}
