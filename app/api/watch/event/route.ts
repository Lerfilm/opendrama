export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { episodeId, watchPosition, watchDuration, completedRate } =
      await req.json()

    if (!episodeId || watchPosition === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    await prisma.watchEvent.create({
      data: {
        userId: session.user.id,
        episodeId,
        watchPosition,
        watchDuration: watchDuration || 0,
        completedRate: completedRate || 0,
        source: "web",
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Watch event error:", error)
    return NextResponse.json(
      { error: "Failed to save watch event" },
      { status: 500 }
    )
  }
}
