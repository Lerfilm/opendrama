import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { generateCoverPrompt, submitCoverGeneration } from "@/lib/cover-generation"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { scriptId, episodeNum } = await req.json()

  if (!scriptId || !episodeNum) {
    return NextResponse.json({ error: "scriptId and episodeNum required" }, { status: 400 })
  }

  // Verify ownership
  const script = await prisma.script.findUnique({
    where: { id: scriptId },
  })
  if (!script || script.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    // Generate cover prompt via LLM
    const prompt = await generateCoverPrompt(scriptId, episodeNum)

    // Submit cover generation (wide + tall)
    const { wideTaskId, tallTaskId } = await submitCoverGeneration(scriptId, episodeNum, prompt)

    return NextResponse.json({ wideTaskId, tallTaskId, prompt })
  } catch (error) {
    console.error("Cover generation failed:", error)
    return NextResponse.json({ error: "Cover generation failed" }, { status: 500 })
  }
}
