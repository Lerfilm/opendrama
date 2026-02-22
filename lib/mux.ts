import Mux from "@mux/mux-node"
import prisma from "@/lib/prisma"

if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
  throw new Error("Missing Mux credentials")
}

export const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
})

export const { video } = mux

/**
 * Upload a generated video segment to Mux for permanent HLS playback.
 * Called after provider reports status=done. Non-blocking — errors are logged but not thrown.
 */
export async function uploadSegmentToMux(segmentId: string, videoUrl: string): Promise<void> {
  try {
    // Create a Mux asset from the provider URL
    const asset = await video.assets.create({
      inputs: [{ url: videoUrl }],
      playback_policy: ["public"],
      encoding_tier: "baseline",
    })

    const playbackId = asset.playback_ids?.[0]?.id
    if (!asset.id || !playbackId) {
      console.error(`[Mux] Asset created but missing IDs for segment ${segmentId}:`, asset)
      return
    }

    await prisma.videoSegment.update({
      where: { id: segmentId },
      data: {
        muxAssetId: asset.id,
        muxPlaybackId: playbackId,
      },
    })

    console.log(`[Mux] Segment ${segmentId} uploaded → asset ${asset.id}, playback ${playbackId}`)
  } catch (err) {
    console.error(`[Mux] Failed to upload segment ${segmentId}:`, err)
  }
}
