import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scriptId, trimData } = await req.json() as {
    scriptId: string
    trimData: Record<string, { trimIn: number; trimOut: number }>
  }

  if (!scriptId || !trimData) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  // Verify ownership
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { id: true, metadata: true },
  })
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Store trim data in script.metadata JSON alongside audioTracks
  let existing: Record<string, unknown> = {}
  if (script.metadata) {
    try { existing = JSON.parse(script.metadata) } catch {}
  }
  await prisma.script.update({
    where: { id: scriptId },
    data: {
      metadata: JSON.stringify({ ...existing, trimData }),
    },
  })

  return NextResponse.json({ ok: true })
}
