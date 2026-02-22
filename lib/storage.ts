/**
 * Supabase Storage — unified media management
 *
 * Buckets:
 *   role-images    — character portraits & reference photos
 *   scene-images   — scene reference / mood board images
 *   video-thumbs   — AI-generated video thumbnails
 *   seed-images    — I2V seed frames (base64 → stored as image)
 *   covers         — script cover images (wide/tall)
 *   props-images   — prop reference photos
 */

export type StorageBucket =
  | "role-images"
  | "scene-images"
  | "video-thumbs"
  | "seed-images"
  | "covers"
  | "props-images"
  | "scripts"

export interface UploadedAsset {
  url: string
  bucket: StorageBucket
  path: string
  size: number
  contentType: string
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

/** True when Supabase Storage is configured */
export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY)
}

/** Upload a Buffer/Blob to a Supabase Storage bucket */
export async function uploadToStorage(
  bucket: StorageBucket,
  path: string,
  data: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("Supabase Storage not configured (missing SUPABASE_SERVICE_ROLE_KEY)")
  }

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: data instanceof Buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase Storage upload failed (${res.status}): ${err}`)
  }

  return getPublicUrl(bucket, path)
}

/** Fetch a remote URL and mirror it into Supabase Storage */
export async function mirrorUrlToStorage(
  bucket: StorageBucket,
  path: string,
  sourceUrl: string,
): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch source URL: ${sourceUrl}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get("content-type") || "application/octet-stream"
  return uploadToStorage(bucket, path, buffer, contentType)
}

/** Get the public URL for an asset already in storage */
export function getPublicUrl(bucket: StorageBucket, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

/** Delete an asset from storage */
export async function deleteFromStorage(bucket: StorageBucket, path: string): Promise<void> {
  if (!isStorageConfigured()) return
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  })
}

/** List all objects in a bucket prefix */
export async function listStorage(
  bucket: StorageBucket,
  prefix = "",
  limit = 100,
): Promise<Array<{ name: string; id: string; updated_at: string; metadata: { size: number; mimetype: string } }>> {
  if (!isStorageConfigured()) return []

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit, offset: 0, sortBy: { column: "created_at", order: "desc" } }),
  })
  if (!res.ok) return []
  return res.json()
}

/** Generate a storage path for a new asset */
export function storagePath(
  userId: string,
  bucket: StorageBucket,
  filename: string,
): string {
  const clean = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
  return `${userId}/${Date.now()}-${clean}`
}
