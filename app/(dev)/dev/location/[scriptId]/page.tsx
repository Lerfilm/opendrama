export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { LocationWorkspace } from "./location-workspace"

export default async function LocationPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    include: {
      scenes: {
        select: { id: true, episodeNum: true, sceneNum: true, heading: true, location: true, timeOfDay: true, mood: true, action: true },
        orderBy: [{ episodeNum: "asc" }, { sceneNum: "asc" }],
      },
    },
  })

  if (!script) redirect("/dev")

  return <LocationWorkspace script={script} />
}
