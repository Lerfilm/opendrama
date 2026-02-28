export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { EditingWorkspace } from "./editing-workspace"

export default async function EditingPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    include: {
      scenes: { orderBy: [{ episodeNum: "asc" }, { sortOrder: "asc" }] },
      videoSegments: { orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }] },
      roles: { select: { id: true, name: true, role: true, avatarUrl: true, referenceImages: true, description: true } },
      locations: { select: { id: true, name: true, type: true, photoUrl: true, description: true, sceneKeys: true } },
      props: { select: { id: true, name: true, category: true, photoUrl: true, description: true, isKey: true, sceneKeys: true } },
    },
  })

  if (!script) redirect("/dev")

  return <EditingWorkspace script={script as Parameters<typeof EditingWorkspace>[0]["script"]} />
}
