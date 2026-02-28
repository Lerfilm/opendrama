/**
 * POST /api/auto-twitter/analyze
 *
 * Resolve a tweet URL → download video → extract 5 frames → AI-analyze content.
 * Returns frames + suggested metadata for review before import.
 * Admin only.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/admin"
import { resolveTwitterVideo, downloadVideo, cleanupVideo } from "@/lib/twitter"
import { extractFrames } from "@/lib/ffmpeg-frames"
import { aiComplete, extractJSON } from "@/lib/ai"
import type { AIContentPart } from "@/lib/ai"

export const maxDuration = 120 // 2 minute timeout for video processing

export async function POST(req: Request) {
  try {
    const session = await auth()
    requireAdmin(session?.user?.email)

    const body = await req.json()
    const { tweetUrl } = body as { tweetUrl: string }

    if (!tweetUrl) {
      return NextResponse.json({ error: "tweetUrl is required" }, { status: 400 })
    }

    // Step 1: Resolve tweet → video URL + metadata
    console.log("[auto-twitter/analyze] Resolving tweet:", tweetUrl)
    const tweetInfo = await resolveTwitterVideo(tweetUrl)
    console.log("[auto-twitter/analyze] Resolved video:", {
      duration: tweetInfo.durationSec,
      author: tweetInfo.author,
      width: tweetInfo.width,
      height: tweetInfo.height,
    })

    // Step 2: Download video to local temp file
    const videoPath = await downloadVideo(tweetInfo.videoUrl)

    try {
      // Step 3: Extract 5 evenly-spaced frames
      console.log("[auto-twitter/analyze] Extracting 5 frames...")
      const frames = await extractFrames(videoPath, 5, tweetInfo.durationSec)
      console.log("[auto-twitter/analyze] Extracted", frames.length, "frames")

      // Step 4: AI-analyze frames with multimodal prompt
      console.log("[auto-twitter/analyze] Sending frames to AI for analysis...")
      const contentParts: AIContentPart[] = [
        {
          type: "text",
          text: `Analyze these 5 frames extracted from a short AI-generated video (${tweetInfo.durationSec}s).
The video was created with Seedance 2.0 AI video generation tool.
Original tweet text: "${tweetInfo.title}"
Author: @${tweetInfo.author}

Based on what you see in these frames, generate metadata for a streaming platform.
Return JSON only:
{
  "title": "Engaging title for this video, max 60 chars, in the video's apparent language or English",
  "description": "2-3 sentence description of what happens in the video, describe the scene, mood, and action",
  "genre": "one of: romance|action|comedy|drama|fantasy|thriller|horror|mystery|documentary",
  "tags": ["tag1", "tag2", "tag3"],
  "suggestedPosterPrompt": "A vivid, detailed image prompt for generating a 9:16 vertical poster that captures the essence of this video. Include details about the main subject, setting, mood, lighting, and composition. Cinematic style, dramatic lighting, photorealistic quality."
}`,
        },
        ...frames.map((frame, i) => ({
          type: "image_url" as const,
          image_url: { url: frame },
        })),
      ]

      const aiResult = await aiComplete({
        messages: [
          { role: "system", content: "You are a video content analyst. Analyze frames from AI-generated videos and produce metadata. Always respond with valid JSON only." },
          { role: "user", content: contentParts },
        ],
        model: "google/gemini-2.0-flash-001",
        temperature: 0.5,
        maxTokens: 1024,
        responseFormat: "json",
      })

      const analysis = extractJSON<{
        title: string
        description: string
        genre: string
        tags: string[]
        suggestedPosterPrompt: string
      }>(aiResult.content)

      console.log("[auto-twitter/analyze] AI analysis:", analysis.title, "—", analysis.genre)

      return NextResponse.json({
        videoUrl: tweetInfo.videoUrl,
        durationSec: tweetInfo.durationSec,
        frames,
        analysis,
        tweetMeta: {
          author: tweetInfo.author,
          text: tweetInfo.title,
          tweetId: tweetInfo.tweetId,
          tweetUrl,
          thumbnailUrl: tweetInfo.thumbnailUrl,
        },
      })
    } finally {
      // Always cleanup temp video file
      await cleanupVideo(videoPath)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[auto-twitter/analyze] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
