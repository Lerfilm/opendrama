export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { FinishingWorkspace } from "./finishing-workspace"

export default async function FinishingPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    include: {
      scenes: { orderBy: [{ episodeNum: "asc" }, { sortOrder: "asc" }] },
      roles: true,
      videoSegments: {
        where: { status: "done", videoUrl: { not: null } },
        orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
      },
      published: true,
    },
  })

  if (!script) redirect("/dev")

  // Get series if published
  const series = script.published
    ? await prisma.series.findFirst({ where: { scriptId: scriptId } })
    : null

  return (
    <FinishingWorkspace
      script={script as Parameters<typeof FinishingWorkspace>[0]["script"]}
      series={series as Parameters<typeof FinishingWorkspace>[0]["series"]}
    />
  )
}
