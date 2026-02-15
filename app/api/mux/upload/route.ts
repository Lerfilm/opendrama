import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { video } from "@/lib/mux"

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // TODO: 添加管理员权限检查

  try {
    const upload = await video.uploads.create({
      cors_origin: "*",
      new_asset_settings: {
        playback_policy: ["public"],
        encoding_tier: "baseline",
      },
    })

    return NextResponse.json({
      uploadId: upload.id,
      url: upload.url,
    })
  } catch (error) {
    console.error("Mux upload error:", error)
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    )
  }
}
