import { spawn } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import { readFile, unlink } from "fs/promises"

/**
 * Extract the last frame from a video URL using ffmpeg.
 * Returns a base64 JPEG data URL suitable for use as an image_url in Seedance I2V requests.
 *
 * @param videoUrl  - Publicly accessible video URL (Seedance CDN URL)
 * @param durationSec - Known duration in seconds (used to seek near the end)
 */
export async function extractLastFrame(videoUrl: string, durationSec: number): Promise<string> {
  const seekOffset = Math.max(0, durationSec - 0.2)
  const outPath = join(tmpdir(), `chain-frame-${randomUUID()}.jpg`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-ss", String(seekOffset),
      "-i", videoUrl,
      "-vframes", "1",
      "-q:v", "3",   // JPEG quality: 2=best, 31=worst; 3 gives ~100-200KB
      "-y",           // overwrite output
      outPath,
    ])

    let stderr = ""
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`))
      }
    })
    proc.on("error", (err) => {
      reject(new Error(`ffmpeg spawn error: ${err.message}. Is ffmpeg installed?`))
    })
  })

  const buffer = await readFile(outPath)
  await unlink(outPath).catch(() => {}) // best-effort cleanup
  return `data:image/jpeg;base64,${buffer.toString("base64")}`
}
