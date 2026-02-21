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

  return NextResponse.json({
    coverWide: script.coverWide,
    coverTall: script.coverTall,
    coverImage: script.coverImage,
    hasCover: !!(script.coverWide || script.coverTall),
  })
}
