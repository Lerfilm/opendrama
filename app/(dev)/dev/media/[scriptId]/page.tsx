export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { MediaWorkspace } from "./media-workspace"

export default async function MediaPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    select: {
      id: true,
      title: true,
      coverImage: true,
      coverWide: true,
      coverTall: true,
      roles: {
        select: { id: true, name: true, role: true, referenceImages: true, avatarUrl: true },
      },
      videoSegments: {
        select: {
          id: true, episodeNum: true, segmentIndex: true, sceneNum: true,
          status: true, videoUrl: true, thumbnailUrl: true, seedImageUrl: true, durationSec: true,
          prompt: true,
        },
        orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
      },
    },
  })

  if (!script) redirect("/dev")

  return <MediaWorkspace script={script as Parameters<typeof MediaWorkspace>[0]["script"]} />
}
