export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { t } from "@/lib/i18n"
import { TheaterLive } from "./theater-live"

export default async function TheaterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params

  const theater = await prisma.theater.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      sessions: {
        orderBy: { sessionNum: "asc" },
        include: {
          messages: { orderBy: { sortOrder: "asc" } },
          options: {
            orderBy: { sortOrder: "asc" },
            include: {
              _count: { select: { votes: true } },
            },
          },
        },
      },
    },
  })

  if (!theater) notFound()

  // 获取用户投票记录
  let userVotes: string[] = []
  if (session?.user?.id) {
    const votes = await prisma.theaterVote.findMany({
      where: { theaterId: id, userId: session.user.id },
      select: { optionId: true },
    })
    userVotes = votes.map((v) => v.optionId)
  }

  return (
    <TheaterLive
      theater={JSON.parse(JSON.stringify(theater))}
      userId={session?.user?.id || null}
      userVotes={userVotes}
    />
  )
}
