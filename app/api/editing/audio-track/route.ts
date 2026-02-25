export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/editing/audio-track?scriptId=xxx&episodeNum=1
 * Returns the audio track URL for a specific episode.
 *
 * POST /api/editing/audio-track
 * Body: { scriptId, episodeNum, audioUrl, audioName }
 * Saves the audio track reference for a specific episode.
 *
 * DELETE /api/editing/audio-track
 * Body: { scriptId, episodeNum }
 * Removes the audio track for a specific episode.
 *
 * Audio track URLs are stored in Script.metadata JSON:
 * { "audioTracks": { "1": { "url": "...", "name": "bgm.mp3" }, "2": {...} } }
 */

interface AudioTrack {
  url: string
  name: string
}

interface ScriptMetadata {
  audioTracks?: Record<string, AudioTrack>
  [key: string]: unknown
}

function parseMetadata(raw: string | null | undefined): ScriptMetadata {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as ScriptMetadata
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const scriptId = searchParams.get("scriptId")
  const episodeNum = searchParams.get("episodeNum")

  if (!scriptId || !episodeNum) {
    return NextResponse.json({ error: "scriptId and episodeNum required" }, { status: 400 })
  }

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { metadata: true },
  })

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 })
  }

  const meta = parseMetadata(script.metadata)
  const track = meta.audioTracks?.[episodeNum] || null

  return NextResponse.json({ track })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { scriptId, episodeNum, audioUrl, audioName } = await req.json()

  if (!scriptId || !episodeNum || !audioUrl) {
    return NextResponse.json({ error: "scriptId, episodeNum, and audioUrl required" }, { status: 400 })
  }

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { id: true, metadata: true },
  })

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 })
  }

  const meta = parseMetadata(script.metadata)
  if (!meta.audioTracks) meta.audioTracks = {}
  meta.audioTracks[String(episodeNum)] = {
    url: audioUrl,
    name: audioName || "audio.mp3",
  }

  await prisma.script.update({
    where: { id: scriptId },
    data: { metadata: JSON.stringify(meta) },
  })

  return NextResponse.json({ ok: true, track: meta.audioTracks[String(episodeNum)] })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { scriptId, episodeNum } = await req.json()

  if (!scriptId || !episodeNum) {
    return NextResponse.json({ error: "scriptId and episodeNum required" }, { status: 400 })
  }

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { id: true, metadata: true },
  })

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 })
  }

  const meta = parseMetadata(script.metadata)
  if (meta.audioTracks) {
    delete meta.audioTracks[String(episodeNum)]
  }

  await prisma.script.update({
    where: { id: scriptId },
    data: { metadata: JSON.stringify(meta) },
  })

  return NextResponse.json({ ok: true })
}
