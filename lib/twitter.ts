/**
 * Twitter/X video extraction using yt-dlp.
 * Resolves tweet URLs to direct video download URLs and metadata.
 */

import { exec } from "child_process"
import { promisify } from "util"
import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import { createWriteStream } from "fs"
import { unlink, stat } from "fs/promises"
import { pipeline } from "stream/promises"
import { Readable } from "stream"

const execAsync = promisify(exec)

export interface TwitterVideoInfo {
  videoUrl: string       // Direct MP4 URL
  durationSec: number
  title: string          // Tweet text (truncated)
  author: string         // @username
  tweetId: string
  thumbnailUrl: string | null
  width: number
  height: number
}

/**
 * Resolve a tweet URL to video metadata using yt-dlp.
 * Requires yt-dlp to be installed: `brew install yt-dlp`
 */
export async function resolveTwitterVideo(tweetUrl: string): Promise<TwitterVideoInfo> {
  // Validate URL format
  const urlMatch = tweetUrl.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/)
  if (!urlMatch) {
    throw new Error("Invalid tweet URL. Expected format: https://x.com/user/status/123456")
  }
  const tweetId = urlMatch[1]

  let stdout: string
  try {
    const result = await execAsync(
      `yt-dlp --dump-json --no-download "${tweetUrl}"`,
      { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 }
    )
    stdout = result.stdout
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("not found") || msg.includes("ENOENT")) {
      throw new Error("yt-dlp not found. Install with: brew install yt-dlp")
    }
    if (msg.includes("Private") || msg.includes("protected")) {
      throw new Error("Tweet is private or protected — cannot access video")
    }
    throw new Error(`Failed to resolve tweet video: ${msg.slice(0, 300)}`)
  }

  const info = JSON.parse(stdout)

  // Find the best MP4 format
  const mp4Formats = (info.formats || [])
    .filter((f: Record<string, unknown>) =>
      f.ext === "mp4" && f.vcodec !== "none" && f.url
    )
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aH = (a.height as number) || 0
      const bH = (b.height as number) || 0
      return aH - bH // lowest quality first, highest last
    })

  const bestFormat = mp4Formats[mp4Formats.length - 1]
  if (!bestFormat) {
    throw new Error("No MP4 video found in this tweet")
  }

  return {
    videoUrl: bestFormat.url as string,
    durationSec: Math.ceil(info.duration || 0),
    title: (info.description || info.title || "Untitled").slice(0, 200),
    author: info.uploader || info.uploader_id || info.channel || "Unknown",
    tweetId,
    thumbnailUrl: info.thumbnail || null,
    width: (bestFormat.width as number) || 1280,
    height: (bestFormat.height as number) || 720,
  }
}

/**
 * Download a video from a URL to a temporary local file.
 * Returns the path to the downloaded file.
 * Caller is responsible for cleanup via unlink.
 */
export async function downloadVideo(videoUrl: string): Promise<string> {
  const ext = videoUrl.includes(".mp4") ? ".mp4" : ".mp4"
  const outPath = join(tmpdir(), `tw-video-${randomUUID()}${ext}`)

  console.log(`[downloadVideo] Downloading to ${outPath}...`)

  const res = await fetch(videoUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  })

  if (!res.ok) {
    throw new Error(`Video download failed: HTTP ${res.status}`)
  }

  if (!res.body) {
    throw new Error("No response body from video URL")
  }

  const fileStream = createWriteStream(outPath)
  // Convert web ReadableStream to Node Readable
  const readable = Readable.fromWeb(res.body as import("stream/web").ReadableStream)
  await pipeline(readable, fileStream)

  const fileInfo = await stat(outPath)
  console.log(`[downloadVideo] Downloaded ${(fileInfo.size / 1024 / 1024).toFixed(1)} MB`)

  return outPath
}

/**
 * Cleanup a temporary video file.
 */
export async function cleanupVideo(videoPath: string): Promise<void> {
  await unlink(videoPath).catch(() => {})
}
