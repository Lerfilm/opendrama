export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { resolveImageUrl } from "@/lib/storage"
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
      metadata: true,
      roles: {
        select: { id: true, name: true, role: true, referenceImages: true, avatarUrl: true },
      },
      videoSegments: {
        select: {
          id: true, episodeNum: true, segmentIndex: true, sceneNum: true,
          status: true, videoUrl: true, thumbnailUrl: true, seedImageUrl: true, durationSec: true,
        },
        orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
      },
    },
  })

  if (!script) redirect("/dev")

  // Rewrite R2.dev URLs to proxy paths
  const resolved = {
    ...script,
    coverImage: resolveImageUrl(script.coverImage),
    coverWide: resolveImageUrl(script.coverWide),
    coverTall: resolveImageUrl(script.coverTall),
    roles: script.roles.map(r => ({
      ...r,
      avatarUrl: resolveImageUrl(r.avatarUrl),
      referenceImages: r.referenceImages.map(u => resolveImageUrl(u)),
    })),
    videoSegments: script.videoSegments.map(s => ({
      ...s,
      thumbnailUrl: resolveImageUrl(s.thumbnailUrl),
      seedImageUrl: resolveImageUrl(s.seedImageUrl),
    })),
  }

  return <MediaWorkspace script={resolved as Parameters<typeof MediaWorkspace>[0]["script"]} />
}
