export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getPublicUrl, listStorage, isStorageConfigured, type StorageBucket } from "@/lib/storage"

/**
 * GET /api/media?scriptId=xxx
 * Returns all media assets for a script, aggregated from:
 *   - VideoSegment.videoUrl / thumbnailUrl / seedImageUrl
 *   - ScriptRole.referenceImages / avatarUrl
 *   - Script.coverImage / coverWide / coverTall
 *   - Supabase Storage listing for userId prefix
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const scriptId = searchParams.get("scriptId")
  if (!scriptId) return NextResponse.json({ error: "scriptId required" }, { status: 400 })

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    include: {
      roles: { select: { id: true, name: true, role: true, referenceImages: true, avatarUrl: true } },
      videoSegments: {
        select: {
          id: true, episodeNum: true, segmentIndex: true, sceneNum: true,
          status: true, videoUrl: true, thumbnailUrl: true, seedImageUrl: true, durationSec: true,
        },
        orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
      },
    },
  })

  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Aggregate all assets from DB
  const assets: Array<{
    id: string
    type: "video" | "thumbnail" | "seed" | "character" | "cover" | "document"
    url: string
    label: string
    bucket: string
    episodeNum?: number
    segmentIndex?: number
    sceneNum?: number
    roleId?: string
    roleName?: string
  }> = []

  // Source PDF from metadata
  if (script.metadata) {
    try {
      const meta = JSON.parse(script.metadata)
      if (meta.pdfUrl) {
        assets.push({ id: "source-pdf", type: "document", url: meta.pdfUrl, label: meta.pdfName || "Source Screenplay PDF", bucket: "scripts" })
      }
    } catch { /* ignore parse errors */ }
  }

  // Cover images
  if (script.coverImage) assets.push({ id: "cover-main", type: "cover", url: script.coverImage, label: "Cover", bucket: "covers" })
  if (script.coverWide) assets.push({ id: "cover-wide", type: "cover", url: script.coverWide, label: "Cover Wide", bucket: "covers" })
  if (script.coverTall) assets.push({ id: "cover-tall", type: "cover", url: script.coverTall, label: "Cover Tall", bucket: "covers" })

  // Role reference images
  for (const role of script.roles) {
    if (role.avatarUrl) {
      assets.push({ id: `role-avatar-${role.id}`, type: "character", url: role.avatarUrl, label: `${role.name} Avatar`, bucket: "role-images", roleId: role.id, roleName: role.name })
    }
    for (let i = 0; i < role.referenceImages.length; i++) {
      const url = role.referenceImages[i]
      if (url && !url.startsWith("data:")) { // skip base64
        assets.push({ id: `role-ref-${role.id}-${i}`, type: "character", url, label: `${role.name} Ref ${i + 1}`, bucket: "role-images", roleId: role.id, roleName: role.name })
      }
    }
  }

  // Video segments
  for (const seg of script.videoSegments) {
    const label = `Ep${seg.episodeNum} SC${String(seg.sceneNum).padStart(2,"0")} #${seg.segmentIndex + 1}`
    if (seg.thumbnailUrl && !seg.thumbnailUrl.startsWith("data:")) {
      assets.push({ id: `thumb-${seg.id}`, type: "thumbnail", url: seg.thumbnailUrl, label: `${label} Thumb`, bucket: "video-thumbs", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum })
    }
    if (seg.videoUrl) {
      assets.push({ id: `video-${seg.id}`, type: "video", url: seg.videoUrl, label: `${label} Video`, bucket: "video-assets", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum })
    }
    if (seg.seedImageUrl && !seg.seedImageUrl.startsWith("data:")) {
      assets.push({ id: `seed-${seg.id}`, type: "seed", url: seg.seedImageUrl, label: `${label} Seed`, bucket: "seed-images", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum })
    }
  }

  // Also list from Supabase Storage if configured
  const storageAssets: Array<{ name: string; url: string; bucket: string; size: number }> = []
  if (isStorageConfigured()) {
    const buckets: StorageBucket[] = ["role-images", "scene-images", "video-thumbs", "seed-images", "covers", "props-images", "scripts"]
    await Promise.all(buckets.map(async (bucket) => {
      const files = await listStorage(bucket, session.user!.id as string, 200)
      for (const f of files) {
        storageAssets.push({
          name: f.name,
          url: getPublicUrl(bucket, `${session.user!.id}/${f.name}`),
          bucket,
          size: f.metadata?.size || 0,
        })
      }
    }))
  }

  return NextResponse.json({
    scriptTitle: script.title,
    assets,
    storageAssets,
    storageConfigured: isStorageConfigured(),
    stats: {
      characters: assets.filter(a => a.type === "character").length,
      thumbnails: assets.filter(a => a.type === "thumbnail").length,
      videos: assets.filter(a => a.type === "video").length,
      seeds: assets.filter(a => a.type === "seed").length,
      covers: assets.filter(a => a.type === "cover").length,
      total: assets.length,
    },
  })
}
