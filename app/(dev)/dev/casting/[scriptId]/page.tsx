export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { CastingWorkspace } from "./casting-workspace"

export default async function CastingPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    select: {
      id: true,
      title: true,
      genre: true,
      roles: {
        select: { id: true, name: true, role: true, description: true, voiceType: true, avatarUrl: true, referenceImages: true },
        orderBy: { createdAt: "asc" },
      },
      scenes: {
        select: { id: true, episodeNum: true, sceneNum: true, heading: true, location: true, timeOfDay: true },
        orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
      },
    },
  })

  if (!script) redirect("/dev")

  return <CastingWorkspace script={script as Parameters<typeof CastingWorkspace>[0]["script"]} />
}
