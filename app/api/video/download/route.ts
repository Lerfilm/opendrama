export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/video/download?segmentId=xxx
 * Proxy-downloads a video segment for the authenticated user.
 * Required so the browser can trigger a true file download (avoids CORS issues
 * with the provider's signed URLs, which don't allow cross-origin downloads).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const segmentId = searchParams.get("segmentId")

  if (!segmentId) {
    return new NextResponse("segmentId is required", { status: 400 })
  }

  // Verify ownership via script relation
  const segment = await prisma.videoSegment.findUnique({
    where: { id: segmentId },
    include: { script: { select: { userId: true, title: true } } },
  })

  if (!segment) {
    return new NextResponse("Segment not found", { status: 404 })
  }
  if (segment.script.userId !== session.user.id) {
    return new NextResponse("Forbidden", { status: 403 })
  }
  if (!segment.videoUrl) {
    return new NextResponse("No video available", { status: 404 })
  }

  // Fetch the video from the provider and stream it back
  try {
    const upstream = await fetch(segment.videoUrl, { cache: "no-store" })
    if (!upstream.ok) {
      return new NextResponse("Failed to fetch video from provider", { status: 502 })
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4"
    const filename = `${segment.script.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}_ep${segment.episodeNum}_seg${segment.segmentIndex + 1}.mp4`

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    console.error("[VideoDownload] Error:", err)
    return new NextResponse("Download failed", { status: 500 })
  }
}
