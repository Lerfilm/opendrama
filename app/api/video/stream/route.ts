export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/video/stream?segmentId=xxx
 *
 * Proxy-streams a video segment for the authenticated user.
 * Supports HTTP Range requests so <video> elements can seek.
 *
 * The provider (Volcengine TOS) issues signed URLs only accessible
 * server-side. This endpoint fetches the video server-side and
 * re-streams it to the browser.
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

  // Verify ownership
  const segment = await prisma.videoSegment.findUnique({
    where: { id: segmentId },
    include: { script: { select: { userId: true } } },
  })

  if (!segment) return new NextResponse("Segment not found", { status: 404 })
  if (segment.script.userId !== session.user.id) return new NextResponse("Forbidden", { status: 403 })
  if (!segment.videoUrl) return new NextResponse("No video available", { status: 404 })

  try {
    // Forward Range header if present (needed for video seeking)
    const rangeHeader = req.headers.get("range")
    const upstreamHeaders: Record<string, string> = {}
    if (rangeHeader) upstreamHeaders["range"] = rangeHeader

    const upstream = await fetch(segment.videoUrl, {
      headers: upstreamHeaders,
      cache: "no-store",
    })

    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[VideoStream] Upstream ${upstream.status} for segment ${segmentId}`)
      return new NextResponse("Failed to fetch video from provider", { status: 502 })
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") || "video/mp4",
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    }

    // Forward relevant upstream headers for Range support
    const contentRange = upstream.headers.get("content-range")
    const contentLength = upstream.headers.get("content-length")
    if (contentRange) responseHeaders["Content-Range"] = contentRange
    if (contentLength) responseHeaders["Content-Length"] = contentLength

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error("[VideoStream] Error:", err)
    return new NextResponse("Stream failed", { status: 500 })
  }
}
