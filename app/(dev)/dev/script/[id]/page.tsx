export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { ScriptWorkspace } from "./script-workspace"

export default async function DevScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const { id } = await params

  const script = await prisma.script.findFirst({
    where: { id, userId: session.user.id as string },
    include: {
      scenes: { orderBy: [{ episodeNum: "asc" }, { sortOrder: "asc" }] },
      roles: { orderBy: { createdAt: "asc" } },
      videoSegments: {
        orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
        select: {
          id: true, episodeNum: true, segmentIndex: true, durationSec: true,
          prompt: true, shotType: true, cameraMove: true, model: true,
          resolution: true, status: true, sceneNum: true,
        },
      },
    },
  })

  if (!script) notFound()

  return <ScriptWorkspace script={JSON.parse(JSON.stringify(script))} />
}
