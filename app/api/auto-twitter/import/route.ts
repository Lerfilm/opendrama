/**
 * POST /api/auto-twitter/import
 *
 * Generate poster → upload video to Mux → create Series + Episode.
 * Admin only.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import { aiGenerateImage } from "@/lib/ai"
import { uploadToStorage, isStorageConfigured, storagePath } from "@/lib/storage"
import { video } from "@/lib/mux"
import prisma from "@/lib/prisma"

export const maxDuration = 180 // 3 minutes for poster gen + Mux upload

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const userId = session.user.id as string

    const body = await req.json()
    const {
      videoUrl,
      title,
      description,
      genre,
      tags,
      posterPrompt,
      durationSec,
      tweetUrl,
      tweetAuthor,
    } = body as {
      videoUrl: string
      title: string
      description: string
      genre: string
      tags: string[]
      posterPrompt?: string
      durationSec: number
      tweetUrl: string
      tweetAuthor?: string
    }

    if (!videoUrl || !title) {
      return NextResponse.json({ error: "videoUrl and title are required" }, { status: 400 })
    }

    // Step 1: Generate poster image (optional)
    let coverTall: string | null = null
    if (posterPrompt) {
      console.log("[auto-twitter/import] Generating poster...")
      try {
        const posterDataUrl = await aiGenerateImage(posterPrompt, "9:16")
        // Upload to R2
        if (isStorageConfigured()) {
          const b64 = posterDataUrl.split(",")[1]
          const buffer = Buffer.from(b64, "base64")
          const path = storagePath("system", "covers", `auto-twitter-${Date.now()}.png`)
          coverTall = await uploadToStorage("covers", path, buffer, "image/png")
          console.log("[auto-twitter/import] Poster uploaded:", coverTall)
        } else {
          coverTall = posterDataUrl // fallback to data URL
        }
      } catch (err) {
        console.error("[auto-twitter/import] Poster generation failed (non-fatal):", err)
        // Continue without poster
      }
    }

    // Step 2: Upload video to Mux
    console.log("[auto-twitter/import] Uploading video to Mux...")
    const asset = await video.assets.create({
      inputs: [{ url: videoUrl }],
      playback_policy: ["public"],
      encoding_tier: "baseline",
    })

    const muxAssetId = asset.id
    const muxPlaybackId = asset.playback_ids?.[0]?.id

    if (!muxAssetId || !muxPlaybackId) {
      return NextResponse.json(
        { error: "Mux asset created but missing playback ID" },
        { status: 500 }
      )
    }
    console.log("[auto-twitter/import] Mux asset:", muxAssetId, "playback:", muxPlaybackId)

    // Step 3: Build attribution description
    const attribution = tweetAuthor
      ? `\n\nOriginally posted by @${tweetAuthor} on X`
      : ""
    const fullDescription = (description || "") + attribution

    // Step 4: Create Series + Episode in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const series = await tx.series.create({
        data: {
          title,
          description: fullDescription,
          synopsis: fullDescription,
          coverUrl: coverTall,
          coverTall: coverTall,
          genre: genre || "drama",
          tags: JSON.stringify(tags || []),
          status: "active",
          userId,
        },
      })

      const episode = await tx.episode.create({
        data: {
          seriesId: series.id,
          episodeNum: 1,
          title,
          description: fullDescription,
          muxAssetId,
          muxPlaybackId,
          duration: Math.round(durationSec || 0),
          unlockCost: 0, // free for imported content
          status: "active",
        },
      })

      return { series, episode }
    })

    console.log("[auto-twitter/import] Created series:", result.series.id, "episode:", result.episode.id)

    return NextResponse.json({
      seriesId: result.series.id,
      episodeId: result.episode.id,
      muxPlaybackId,
      coverUrl: coverTall,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[auto-twitter/import] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
