export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const MAX_SIZE_BYTES = 800 * 1024 // 800 KB limit for base64 data URL

/**
 * POST /api/upload/role-image
 * Accepts multipart form data with a single "file" field (image).
 * Returns { url } — a base64 data URL suitable for storing in referenceImages[].
 *
 * If SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are configured,
 * uploads to Supabase Storage bucket "role-images" and returns a public URL.
 * Otherwise stores as base64 data URL (fine for small reference images).
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
        { error: `Image too large. Max ${MAX_SIZE_BYTES / 1024}KB (compress before uploading)` },
        { status: 413 }
      )
    }

    // If Supabase storage is configured, upload there
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && serviceRoleKey) {
      const fileName = `${session.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
      const uploadUrl = `${supabaseUrl}/storage/v1/object/role-images/${fileName}`

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": file.type,
          "x-upsert": "true",
        },
        body: buffer,
      })

      if (uploadRes.ok) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/role-images/${fileName}`
        return NextResponse.json({ url: publicUrl })
      }
      // Fall through to base64 if upload fails
      console.warn("[role-image upload] Supabase upload failed, falling back to base64")
    }

    // Fallback: return as base64 data URL
    const base64 = buffer.toString("base64")
    const dataUrl = `data:${file.type};base64,${base64}`
    return NextResponse.json({ url: dataUrl })
  } catch (error) {
    console.error("Role image upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
