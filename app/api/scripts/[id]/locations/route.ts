export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: scriptId } = await params
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { metadata: true }
  })
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })
  let locations = []
  try {
    const meta = script.metadata ? JSON.parse(script.metadata) : {}
    locations = meta.locations || []
  } catch { /* ignore */ }
  return NextResponse.json({ locations })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: scriptId } = await params
  const { locations } = await req.json()
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { metadata: true }
  })
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })
  let meta: Record<string, unknown> = {}
  try { meta = script.metadata ? JSON.parse(script.metadata) : {} } catch { /* ignore */ }
  meta.locations = locations
  await prisma.script.update({
    where: { id: scriptId },
    data: { metadata: JSON.stringify(meta) }
  })
  return NextResponse.json({ success: true })
}
