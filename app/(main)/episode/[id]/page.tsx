import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/prisma"

type Props = {
  params: Promise<{ id: string }>
}

export default async function EpisodePage({ params }: Props) {
  const { id } = await params

  const episode = await prisma.episode.findUnique({
    where: { id },
    select: { seriesId: true, episodeNum: true },
  })

  if (!episode) {
    notFound()
  }

  redirect(`/watch/${episode.seriesId}?ep=${episode.episodeNum}`)
}
