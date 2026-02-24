/**
 * Cloudflare R2 Storage — unified media management (S3-compatible)
 *
 * All bucket types are stored as path prefixes inside a single R2 bucket:
 *   role-images/    — character portraits & reference photos
 *   scene-images/   — scene reference / mood board images
 *   video-thumbs/   — AI-generated video thumbnails
 *   seed-images/    — I2V seed frames (base64 → stored as image)
 *   covers/         — script cover images (wide/tall)
 *   props-images/   — prop reference photos
 *   scripts/        — uploaded script PDFs
 *   finished-videos/ — finished video exports
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3"

export type StorageBucket =
  | "role-images"
  | "scene-images"
  | "video-thumbs"
  | "seed-images"
  | "covers"
  | "props-images"
  | "scripts"
  | "finished-videos"

export interface UploadedAsset {
  url: string
  bucket: StorageBucket
  path: string
  size: number
  contentType: string
}

/* ── Environment variables ─────────────────────────────────── */

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ""
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ""
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ""
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || ""
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "") // strip trailing slash

/* ── Lazy-initialised S3 client ────────────────────────────── */

let _client: S3Client | null = null

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  }
  return _client
}

/** Full R2 object key including bucket-type prefix */
function objectKey(bucket: StorageBucket, path: string): string {
  return `${bucket}/${path}`
}

/* ── Public helpers ────────────────────────────────────────── */

/** True when Cloudflare R2 storage is configured */
export function isStorageConfigured(): boolean {
  return Boolean(
    R2_ACCOUNT_ID &&
      R2_ACCESS_KEY_ID &&
      R2_SECRET_ACCESS_KEY &&
      R2_BUCKET_NAME &&
      R2_PUBLIC_URL,
  )
}

/** Upload a Buffer / Uint8Array / ArrayBuffer to R2 */
export async function uploadToStorage(
  bucket: StorageBucket,
  path: string,
  data: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("Cloudflare R2 not configured (missing R2 env vars)")
  }

  const key = objectKey(bucket, path)
  const body =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : data instanceof Buffer
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data

  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )

  return getPublicUrl(bucket, path)
}

/** Fetch a remote URL and mirror it into R2 */
export async function mirrorUrlToStorage(
  bucket: StorageBucket,
  path: string,
  sourceUrl: string,
): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch source URL: ${sourceUrl}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType =
    res.headers.get("content-type") || "application/octet-stream"
  return uploadToStorage(bucket, path, buffer, contentType)
}

/** Get the public URL for an asset already in storage */
export function getPublicUrl(bucket: StorageBucket, path: string): string {
  return `${R2_PUBLIC_URL}/${bucket}/${path}`
}

/** Delete an asset from storage */
export async function deleteFromStorage(
  bucket: StorageBucket,
  path: string,
): Promise<void> {
  if (!isStorageConfigured()) return
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey(bucket, path),
      }),
    )
  } catch (err) {
    console.warn(`[storage] delete failed for ${bucket}/${path}:`, err)
  }
}

/** List all objects in a bucket prefix */
export async function listStorage(
  bucket: StorageBucket,
  prefix = "",
  limit = 100,
): Promise<
  Array<{
    name: string
    id: string
    updated_at: string
    metadata: { size: number; mimetype: string }
  }>
> {
  if (!isStorageConfigured()) return []

  try {
    const fullPrefix = prefix
      ? `${bucket}/${prefix}`
      : `${bucket}/`

    const result = await getClient().send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: fullPrefix,
        MaxKeys: limit,
      }),
    )

    return (result.Contents || []).map((obj) => ({
      name: (obj.Key || "").replace(`${bucket}/`, ""),
      id: obj.ETag || "",
      updated_at: obj.LastModified?.toISOString() || "",
      metadata: {
        size: obj.Size || 0,
        mimetype: "", // R2 ListObjects doesn't return content-type
      },
    }))
  } catch {
    return []
  }
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
