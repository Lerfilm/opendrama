export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { generateCoverPrompt, submitCoverGeneration, pollAndSaveCovers } from "@/lib/cover-generation"

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

    // Submit cover generation (wide + tall) to Jimeng
    const { wideTaskId, tallTaskId } = await submitCoverGeneration(scriptId, episodeNum, prompt)

    // Poll & save in background (fire-and-forget)
    // The client polls /api/cover/status to check progress
    pollAndSaveCovers(scriptId, wideTaskId, tallTaskId).catch(err => {
      console.error("[Cover] Background poll failed:", err)
    })

    // Return task IDs immediately so client can poll for progress
    return NextResponse.json({ wideTaskId, tallTaskId, prompt, status: "generating" })
  } catch (error) {
    console.error("Cover generation failed:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
