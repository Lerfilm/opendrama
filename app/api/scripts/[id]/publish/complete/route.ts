export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { video } from "@/lib/mux"

/**
 * POST /api/scripts/[id]/publish/complete
 * Called by client after successfully PUT-ing video to Mux upload URL.
 * Body: { episodeNum, muxUploadId, seriesId }
 * Polls Mux for asset status, stores muxAssetId + muxPlaybackId on Episode.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  try {
    const { episodeNum, muxUploadId, seriesId } = await req.json()

    // Verify ownership
    const script = await prisma.script.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 })

    // Poll Mux upload to get assetId (upload usually processes quickly)
    let muxAssetId: string | undefined
    let muxPlaybackId: string | undefined

    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(r => setTimeout(r, 2000))
      const upload = await video.uploads.retrieve(muxUploadId)
      if (upload.asset_id) {
        muxAssetId = upload.asset_id
        break
      }
    }

    if (!muxAssetId) {
      // Upload accepted but asset not ready yet — client can retry later
      return NextResponse.json({ status: "processing", muxUploadId })
    }

    // Get playback ID from asset
    const asset = await video.assets.retrieve(muxAssetId)
    muxPlaybackId = asset.playback_ids?.[0]?.id

    await prisma.episode.updateMany({
      where: { seriesId, episodeNum },
      data: {
        muxAssetId,
        ...(muxPlaybackId ? { muxPlaybackId } : {}),
      },
    })

    console.log(`[Publish/Complete] Ep${episodeNum}: asset=${muxAssetId} playback=${muxPlaybackId ?? "pending"}`)

    return NextResponse.json({
      status: muxPlaybackId ? "done" : "processing",
      muxAssetId,
      muxPlaybackId,
    })
  } catch (error) {
    console.error("Publish complete error:", error)
    return NextResponse.json({ error: "Failed to complete publish" }, { status: 500 })
  }
}
