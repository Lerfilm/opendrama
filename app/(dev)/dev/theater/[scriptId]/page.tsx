export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { resolveImageUrl } from "@/lib/storage"
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
      locations: {
        select: { name: true, photoUrl: true, photos: true },
      },
      videoSegments: { orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }] },
    },
  })

  if (!script) redirect("/dev")

  // Rewrite R2.dev URLs to proxy paths
  const resolved = {
    ...script,
    roles: script.roles.map(r => ({
      ...r,
      avatarUrl: r.avatarUrl ? resolveImageUrl(r.avatarUrl) : r.avatarUrl,
      referenceImages: r.referenceImages.map(u => resolveImageUrl(u)),
    })),
    locations: script.locations.map(l => {
      let photos: { url: string; note?: string }[] = []
      try { photos = l.photos ? JSON.parse(l.photos as string) : [] } catch { /* ok */ }
      return {
        name: l.name,
        photoUrl: l.photoUrl ? resolveImageUrl(l.photoUrl) : l.photoUrl,
        photos: photos.map(p => ({ ...p, url: p.url ? resolveImageUrl(p.url) : p.url })),
      }
    }),
    videoSegments: script.videoSegments.map(s => ({
      ...s,
      thumbnailUrl: s.thumbnailUrl ? resolveImageUrl(s.thumbnailUrl) : s.thumbnailUrl,
      seedImageUrl: s.seedImageUrl ? resolveImageUrl(s.seedImageUrl) : s.seedImageUrl,
    })),
  }

  // Get user balance
  const balance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id as string },
  })

  return (
    <TheaterWorkspace
      script={resolved as Parameters<typeof TheaterWorkspace>[0]["script"]}
      initialBalance={balance?.balance ?? 0}
    />
  )
}
