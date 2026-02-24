export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { uploadToStorage, storagePath, type StorageBucket } from "@/lib/storage"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024  // 5 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200 MB

const BUCKET_MAP: Record<string, StorageBucket> = {
  "role-images": "role-images",
  "scene-images": "scene-images",
  "video-thumbs": "video-thumbs",
  "seed-images": "seed-images",
  "covers": "covers",
  "props-images": "props-images",
  "finished-videos": "finished-videos",
}

/**
 * POST /api/upload/media
 * Body: multipart form
 *   file   — the file to upload
 *   bucket — storage bucket name (role-images | scene-images | video-thumbs | seed-images | covers | props-images)
 *
 * Returns { url, bucket, path, size, contentType }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const bucketParam = (formData.get("bucket") as string | null) || "role-images"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const bucket = BUCKET_MAP[bucketParam]
    if (!bucket) {
      return NextResponse.json(
        { error: `Invalid bucket. Must be one of: ${Object.keys(BUCKET_MAP).join(", ")}` },
        { status: 400 }
      )
    }

    const isImage = file.type.startsWith("image/")
    const isVideo = file.type.startsWith("video/")

    if (!isImage && !isVideo) {
      return NextResponse.json({ error: "File must be an image or video" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES

    if (buffer.byteLength > maxBytes) {
      return NextResponse.json(
        { error: `File too large. Max ${maxBytes / (1024 * 1024)}MB` },
        { status: 413 }
      )
    }

    const path = storagePath(session.user.id as string, bucket, file.name)
    const url = await uploadToStorage(bucket, path, buffer, file.type)

    return NextResponse.json({
      url,
      bucket,
      path,
      size: buffer.byteLength,
      contentType: file.type,
    })
  } catch (error) {
    console.error("Media upload error:", error)
    // If Supabase not configured, fall back to base64 for images
    try {
      const formData = await req.formData().catch(() => null)
      if (!formData) return NextResponse.json({ error: "Upload failed" }, { status: 500 })
      const file = formData.get("file") as File | null
      if (!file?.type.startsWith("image/")) return NextResponse.json({ error: "Upload failed" }, { status: 500 })
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      if (buffer.byteLength > 800 * 1024) return NextResponse.json({ error: "File too large for base64 fallback (800KB max)" }, { status: 413 })
      const base64 = buffer.toString("base64")
      return NextResponse.json({ url: `data:${file.type};base64,${base64}`, bucket: "local", path: "", size: buffer.byteLength, contentType: file.type })
    } catch {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 })
    }
  }
}
