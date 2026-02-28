/**
 * Extract N evenly-spaced frames from a video file using ffmpeg.
 * Returns an array of base64 JPEG data URLs.
 */

import { spawn } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import { readFile, unlink } from "fs/promises"

/**
 * Probe video duration using ffprobe.
 */
export async function probeVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      videoPath,
    ])

    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(parseFloat(stdout.trim()))
      } else {
        reject(new Error(`ffprobe failed (code ${code}): ${stderr.slice(-300)}`))
      }
    })
    proc.on("error", (err) => {
      reject(new Error(`ffprobe spawn error: ${err.message}. Is ffprobe installed?`))
    })
  })
}

/**
 * Extract a single frame at a given timestamp from a video file.
 * Returns a base64 JPEG data URL.
 */
async function extractFrameAt(videoPath: string, timestampSec: number): Promise<string> {
  const outPath = join(tmpdir(), `frame-${randomUUID()}.jpg`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-ss", String(timestampSec),
      "-i", videoPath,
      "-vframes", "1",
      "-q:v", "3",   // JPEG quality: 2=best, 31=worst; 3 gives ~100-200KB
      "-y",
      outPath,
    ])

    let stderr = ""
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg frame extraction failed (code ${code}): ${stderr.slice(-300)}`))
    })
    proc.on("error", (err) => {
      reject(new Error(`ffmpeg spawn error: ${err.message}. Is ffmpeg installed?`))
    })
  })

  const buffer = await readFile(outPath)
  await unlink(outPath).catch(() => {}) // best-effort cleanup
  return `data:image/jpeg;base64,${buffer.toString("base64")}`
}

/**
 * Extract N evenly-spaced frames from a video file.
 *
 * @param videoPath   Local file path to the video
 * @param count       Number of frames to extract (default 5)
 * @param durationSec Optional known duration (saves an ffprobe call)
 * @returns           Array of base64 JPEG data URLs
 */
export async function extractFrames(
  videoPath: string,
  count: number = 5,
  durationSec?: number,
): Promise<string[]> {
  const duration = durationSec ?? await probeVideoDuration(videoPath)

  if (duration <= 0) {
    throw new Error("Video duration is 0 or negative")
  }

  // Calculate N evenly-spaced timestamps
  // For 5 frames from a 10s video: 1.67s, 3.33s, 5s, 6.67s, 8.33s
  const timestamps = Array.from({ length: count }, (_, i) =>
    Math.max(0, (duration * (i + 1)) / (count + 1))
  )

  console.log(`[extractFrames] Extracting ${count} frames from ${duration.toFixed(1)}s video at:`,
    timestamps.map(t => `${t.toFixed(1)}s`).join(", "))

  // Extract all frames in parallel
  const frames = await Promise.all(
    timestamps.map(ts => extractFrameAt(videoPath, ts))
  )

  return frames
}
