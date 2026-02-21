export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Update a scene
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "Scene id is required" }, { status: 400 })
    }

    // Verify ownership
    const scene = await prisma.scriptScene.findUnique({
      where: { id },
      include: { script: { select: { userId: true } } },
    })

    if (!scene || scene.script.userId !== session.user.id) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 })
    }

    const allowedFields = [
      "heading", "action", "dialogue", "stageDirection",
      "mood", "location", "timeOfDay", "promptHint",
      "duration", "sortOrder",
    ]

    const data: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        data[key] = updates[key]
      }
    }

    const updated = await prisma.scriptScene.update({
      where: { id },
      data,
    })

    return NextResponse.json({ scene: updated })
  } catch (error) {
    console.error("Update scene error:", error)
    return NextResponse.json({ error: "Failed to update scene" }, { status: 500 })
  }
}

// Create a new scene
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { scriptId, episodeNum, afterSceneId } = await req.json()

    if (!scriptId || !episodeNum) {
      return NextResponse.json({ error: "scriptId and episodeNum are required" }, { status: 400 })
    }

    // Verify ownership
    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
    })
    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    // Get existing scenes to determine sort order and scene number
    const existingScenes = await prisma.scriptScene.findMany({
      where: { scriptId, episodeNum },
      orderBy: { sortOrder: "asc" },
    })

    let sortOrder = 0
    let sceneNum = 1

    if (afterSceneId) {
      const afterScene = existingScenes.find(s => s.id === afterSceneId)
      if (afterScene) {
        sortOrder = afterScene.sortOrder + 1
        sceneNum = afterScene.sceneNum + 1
      }
    } else {
      // Add at end
      if (existingScenes.length > 0) {
        const last = existingScenes[existingScenes.length - 1]
        sortOrder = last.sortOrder + 1
        sceneNum = last.sceneNum + 1
      }
    }

    const scene = await prisma.scriptScene.create({
      data: {
        scriptId,
        episodeNum,
        sceneNum,
        sortOrder,
        heading: "",
        action: "",
        dialogue: "[]",
        stageDirection: "",
      },
    })

    return NextResponse.json({ scene })
  } catch (error) {
    console.error("Create scene error:", error)
    return NextResponse.json({ error: "Failed to create scene" }, { status: 500 })
  }
}

// Delete a scene
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const sceneId = searchParams.get("id")

    if (!sceneId) {
      return NextResponse.json({ error: "Scene id is required" }, { status: 400 })
    }

    const scene = await prisma.scriptScene.findUnique({
      where: { id: sceneId },
      include: { script: { select: { userId: true } } },
    })

    if (!scene || scene.script.userId !== session.user.id) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 })
    }

    await prisma.scriptScene.delete({ where: { id: sceneId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete scene error:", error)
    return NextResponse.json({ error: "Failed to delete scene" }, { status: 500 })
  }
}
