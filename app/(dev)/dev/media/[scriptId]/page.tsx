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

  // Fetch script + rehearsals in parallel
  const [script, rehearsals] = await Promise.all([
    prisma.script.findFirst({
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
        locations: {
          select: { id: true, name: true, type: true, photoUrl: true, photos: true },
        },
        props: {
          select: { id: true, name: true, category: true, photoUrl: true, photos: true },
        },
        videoSegments: {
          select: {
            id: true, episodeNum: true, segmentIndex: true, sceneNum: true,
            status: true, videoUrl: true, thumbnailUrl: true, seedImageUrl: true, durationSec: true,
          },
          orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
        },
      },
    }),
    prisma.rehearsal.findMany({
      where: { userId: session.user.id as string, status: "done", videoUrl: { not: null } },
      select: {
        id: true,
        prompt: true,
        model: true,
        resolution: true,
        durationSec: true,
        videoUrl: true,
        thumbnailUrl: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

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
    locations: script.locations.map(l => {
      let photos: { url: string; note?: string }[] = []
      if (l.photos) {
        try { photos = JSON.parse(l.photos) } catch { /* */ }
      }
      return {
        ...l,
        photoUrl: resolveImageUrl(l.photoUrl),
        parsedPhotos: photos.map(p => ({ ...p, url: resolveImageUrl(p.url) ?? p.url })),
      }
    }),
    props: script.props.map(p => {
      let photos: { url: string; note?: string }[] = []
      if (p.photos) {
        try { photos = JSON.parse(p.photos) } catch { /* */ }
      }
      return {
        ...p,
        photoUrl: resolveImageUrl(p.photoUrl),
        parsedPhotos: photos.map(ph => ({ ...ph, url: resolveImageUrl(ph.url) ?? ph.url })),
      }
    }),
    videoSegments: script.videoSegments.map(s => ({
      ...s,
      thumbnailUrl: resolveImageUrl(s.thumbnailUrl),
      seedImageUrl: resolveImageUrl(s.seedImageUrl),
    })),
    rehearsals: rehearsals.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  }

  return <MediaWorkspace script={resolved as Parameters<typeof MediaWorkspace>[0]["script"]} />
}
