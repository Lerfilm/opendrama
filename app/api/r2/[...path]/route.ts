export const dynamic = "force-dynamic"

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { NextRequest } from "next/server"

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ""
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ""
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ""
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || ""

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

/**
 * GET /api/r2/{bucket}/{path...}
 * Proxy R2 objects through the app server so browsers in China can access them.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  if (!path || path.length < 2) {
    return new Response("Not found", { status: 404 })
  }

  const key = path.join("/")

  try {
    const result = await getClient().send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }),
    )

    if (!result.Body) {
      return new Response("Not found", { status: 404 })
    }

    // Convert readable stream to web ReadableStream
    const body = result.Body as ReadableStream | NodeJS.ReadableStream
    const webStream =
      "getReader" in body
        ? (body as ReadableStream)
        : new ReadableStream({
            start(controller) {
              const nodeStream = body as NodeJS.ReadableStream
              nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
              nodeStream.on("end", () => controller.close())
              nodeStream.on("error", (err: Error) => controller.error(err))
            },
          })

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": result.ContentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(result.ContentLength ? { "Content-Length": String(result.ContentLength) } : {}),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("NoSuchKey") || message.includes("not found") || message.includes("404")) {
      return new Response("Not found", { status: 404 })
    }
    console.error("[R2 proxy] Error fetching object:", key, err)
    return new Response("Internal Server Error", { status: 500 })
  }
}
