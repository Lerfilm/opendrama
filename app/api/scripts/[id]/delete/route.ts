export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/scripts/[id]/delete
 * Soft-delete a script. Password must equal the script title.
 * Sets deletedAt timestamp — project is recoverable for 30 days.
 *
 * POST /api/scripts/[id]/delete  { action: "delete", password: "剧集名称" }
 * POST /api/scripts/[id]/delete  { action: "restore" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { action, password } = body

  const script = await prisma.script.findFirst({
    where: { id, userId: session.user.id as string },
    select: { id: true, title: true, deletedAt: true },
  })

  if (!script) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (action === "restore") {
    await prisma.script.update({
      where: { id },
      data: { deletedAt: null },
    })
    return NextResponse.json({ ok: true, message: "Project restored" })
  }

  if (action === "delete") {
    // Password must match the exact script title
    if (!password || password.trim() !== script.title.trim()) {
      return NextResponse.json({ error: "Wrong password. Enter the exact project title to confirm." }, { status: 400 })
    }

    await prisma.script.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ ok: true, message: "Project moved to trash. Recoverable for 30 days." })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
