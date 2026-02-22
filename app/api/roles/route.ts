export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/roles
 * Create a new ScriptRole.
 * Body: { scriptId, name, role }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { scriptId, name, role } = await req.json()
    if (!scriptId || !name) return NextResponse.json({ error: "scriptId and name required" }, { status: 400 })

    // Verify ownership
    const script = await prisma.script.findFirst({ where: { id: scriptId, userId: session.user.id } })
    if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 })

    const newRole = await prisma.scriptRole.create({
      data: { scriptId, name, role: role || "supporting", referenceImages: [] },
    })
    return NextResponse.json({ role: newRole })
  } catch (e) {
    console.error("Create role error:", e)
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 })
  }
}

/**
 * DELETE /api/roles
 * Delete a ScriptRole.
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const role = await prisma.scriptRole.findUnique({
      where: { id },
      include: { script: { select: { userId: true } } },
    })
    if (!role || role.script.userId !== session.user.id) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }

    await prisma.scriptRole.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Delete role error:", e)
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 })
  }
}

/**
 * PUT /api/roles
 * Update a ScriptRole's referenceImages (and optionally description/name).
 * Body: { id, referenceImages?: string[], description?: string, name?: string }
 */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, referenceImages, description, name } = body

    if (!id) {
      return NextResponse.json({ error: "Role id is required" }, { status: 400 })
    }

    // Verify ownership via script
    const role = await prisma.scriptRole.findUnique({
      where: { id },
      include: { script: { select: { userId: true } } },
    })

    if (!role || role.script.userId !== session.user.id) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (referenceImages !== undefined) data.referenceImages = referenceImages
    if (description !== undefined) data.description = description
    if (name !== undefined) data.name = name

    const updated = await prisma.scriptRole.update({
      where: { id },
      data,
    })

    return NextResponse.json({ role: updated })
  } catch (error) {
    console.error("Update role error:", error)
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 })
  }
}
