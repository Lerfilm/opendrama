export const dynamic = "force-dynamic"
export const maxDuration = 60
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { chargeAiFeature } from "@/lib/ai-pricing"
import { extractPropsFromScenes } from "@/lib/image-generation"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const charge = await chargeAiFeature(session.user.id, "extract_props")
  if (!charge.ok) {
    return NextResponse.json({ error: "insufficient_balance", balance: charge.balance, required: charge.required }, { status: 402 })
  }

  try {
    const { scriptId } = await req.json()
    if (!scriptId) return NextResponse.json({ error: "scriptId required" }, { status: 400 })

    // Verify ownership
    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: session.user.id },
    })
    if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Fetch scene action data server-side
    const scenes = await prisma.scriptScene.findMany({
      where: { scriptId },
      select: { episodeNum: true, sceneNum: true, heading: true, action: true },
      orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
      take: 20,
    })

    const props = await extractPropsFromScenes({ scenes: scenes.map(s => ({ ...s, action: s.action || "" })) })

    // Persist extracted props to ScriptProp (skip duplicates)
    if (props.length > 0) {
      await prisma.scriptProp.createMany({
        data: props.map(p => ({
          scriptId,
          name: p.name,
          category: p.category || "other",
          description: p.description || null,
          isKey: p.isKey ?? false,
        })),
        skipDuplicates: true,
      }).catch(err => console.warn("[extract-props] DB save failed:", err))
    }

    return NextResponse.json({ props })
  } catch (error) {
    console.error("Extract props error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
