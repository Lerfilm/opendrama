export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

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
