export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { TheaterWorkspace } from "./theater-workspace"

export default async function TheaterPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    include: {
      scenes: {
        select: {
          id: true, episodeNum: true, sceneNum: true,
          heading: true, location: true, timeOfDay: true,
          mood: true, action: true,
        },
        orderBy: [{ episodeNum: "asc" }, { sortOrder: "asc" }],
      },
      roles: true,
      videoSegments: { orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }] },
    },
  })

  if (!script) redirect("/dev")

  // Get user balance
  const balance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id as string },
  })

  return (
    <TheaterWorkspace
      script={script as Parameters<typeof TheaterWorkspace>[0]["script"]}
      initialBalance={balance?.balance ?? 0}
    />
  )
}
