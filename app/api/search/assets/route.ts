import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { resolveImageUrl } from "@/lib/storage"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const scripts = await prisma.script.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      title: true,
      coverImage: true,
      roles: {
        select: { id: true, name: true, role: true, avatarUrl: true, referenceImages: true },
      },
      locations: {
        select: { name: true, photoUrl: true, photos: true },
      },
      props: {
        select: { id: true, name: true, category: true, photoUrl: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  const result = {
    scripts: scripts.map(s => ({
      id: s.id,
      title: s.title,
      coverImage: s.coverImage ? resolveImageUrl(s.coverImage) : null,
    })),
    roles: scripts.flatMap(s =>
      s.roles.map(r => ({
        id: r.id,
        name: r.name,
        role: r.role,
        avatarUrl: r.referenceImages?.[0]
          ? resolveImageUrl(r.referenceImages[0])
          : r.avatarUrl
            ? resolveImageUrl(r.avatarUrl)
            : null,
        scriptId: s.id,
        scriptTitle: s.title,
      }))
    ),
    locations: scripts.flatMap(s =>
      s.locations.map(l => {
        let photoUrl = l.photoUrl ? resolveImageUrl(l.photoUrl) : null
        if (!photoUrl) {
          try {
            const photos = l.photos ? JSON.parse(l.photos as string) : []
            if (photos[0]?.url) photoUrl = resolveImageUrl(photos[0].url)
          } catch { /* ok */ }
        }
        return {
          name: l.name,
          photoUrl,
          scriptId: s.id,
          scriptTitle: s.title,
        }
      })
    ),
    props: scripts.flatMap(s =>
      s.props.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        photoUrl: p.photoUrl ? resolveImageUrl(p.photoUrl) : null,
        scriptId: s.id,
        scriptTitle: s.title,
      }))
    ),
  }

  return NextResponse.json(result)
}
