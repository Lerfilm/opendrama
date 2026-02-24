export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { uploadToStorage, storagePath, isStorageConfigured } from "@/lib/storage"

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB (R2 handles larger files fine)

/**
 * POST /api/upload/role-image
 * Accepts multipart form data with a single "file" field (image).
 * Returns { url } — uploaded to Cloudflare R2 or base64 data URL fallback.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate MIME type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    if (buffer.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Image too large. Max ${MAX_SIZE_BYTES / (1024 * 1024)}MB` },
        { status: 413 },
      )
    }

    // Upload to R2 if configured
    if (isStorageConfigured()) {
      const path = storagePath(session.user.id, "role-images", file.name)
      const url = await uploadToStorage("role-images", path, buffer, file.type)
      return NextResponse.json({ url })
    }

    // Fallback: return as base64 data URL (small images only)
    if (buffer.byteLength > 800 * 1024) {
      return NextResponse.json(
        { error: "Storage not configured and file too large for base64 fallback (800KB max)" },
        { status: 413 },
      )
    }
    const base64 = buffer.toString("base64")
    const dataUrl = `data:${file.type};base64,${base64}`
    return NextResponse.json({ url: dataUrl })
  } catch (error) {
    console.error("Role image upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
