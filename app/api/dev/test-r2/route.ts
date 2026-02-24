export const dynamic = "force-dynamic";

import { NextResponse } from "next/server"
import { isStorageConfigured, uploadToStorage } from "@/lib/storage"

/**
 * GET /api/dev/test-r2
 * Upload a tiny PNG to R2 and verify the public URL is accessible.
 */
export async function GET() {
  const diagnostics: Record<string, unknown> = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ? "set" : "MISSING",
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ? "set" : "MISSING",
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ? "set" : "MISSING",
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "MISSING",
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || "MISSING",
    isStorageConfigured: isStorageConfigured(),
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "R2 not configured",
      diagnostics,
    })
  }

  // Create a 1x1 red PNG (67 bytes)
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64"
  )

  // 1. Upload test
  let uploadUrl: string
  try {
    uploadUrl = await uploadToStorage(
      "role-images",
      `_test/r2-check-${Date.now()}.png`,
      pngBytes,
      "image/png"
    )
    diagnostics.uploadOk = true
    diagnostics.uploadUrl = uploadUrl
  } catch (err: unknown) {
    diagnostics.uploadOk = false
    diagnostics.uploadError = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: "Upload failed", diagnostics })
  }

  // 2. Fetch the public URL to verify accessibility
  try {
    const res = await fetch(uploadUrl, { method: "HEAD" })
    diagnostics.publicUrlStatus = res.status
    diagnostics.publicUrlOk = res.ok
    diagnostics.publicUrlHeaders = {
      contentType: res.headers.get("content-type"),
      contentLength: res.headers.get("content-length"),
    }
  } catch (err: unknown) {
    diagnostics.publicUrlOk = false
    diagnostics.publicUrlError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({
    ok: diagnostics.uploadOk && diagnostics.publicUrlOk,
    diagnostics,
  })
}
