export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { GenerateWorkbench } from "./generate-workbench"

export default async function GenerateEpisodePage({
  params,
}: {
  params: Promise<{ scriptId: string; episodeNum: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const { scriptId, episodeNum: epStr } = await params
  const episodeNum = parseInt(epStr, 10)
  if (isNaN(episodeNum)) notFound()

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    include: {
      scenes: {
        where: { episodeNum },
        orderBy: { sortOrder: "asc" },
      },
      roles: true,
      videoSegments: {
        where: { episodeNum },
        orderBy: { segmentIndex: "asc" },
      },
    },
  })

  if (!script) notFound()

  // Get user balance
  const balance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id },
  })

  return (
    <div className="p-4 pb-24">
      <GenerateWorkbench
        script={JSON.parse(JSON.stringify(script))}
        episodeNum={episodeNum}
        balance={balance ? balance.balance - balance.reserved : 0}
      />
    </div>
  )
}
