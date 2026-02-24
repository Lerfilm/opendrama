export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: scriptId } = await params

  // Verify ownership
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { id: true, metadata: true },
  })
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Read from ScriptLocation table
  const locs = await prisma.scriptLocation.findMany({
    where: { scriptId },
    select: {
      id: true, name: true, type: true, description: true,
      address: true, contact: true, notes: true,
      photos: true, timeSlots: true, sceneKeys: true,
    },
    orderBy: { name: "asc" },
  })

  if (locs.length > 0) {
    const locations = locs.map(loc => ({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      description: loc.description || "",
      address: loc.address || "",
      contact: loc.contact || "",
      notes: loc.notes || "",
      photos: safeParseJson(loc.photos, []),
      timeSlots: safeParseJson(loc.timeSlots, []),
    }))
    return NextResponse.json({ locations })
  }

  // Fallback: migrate legacy data from Script.metadata
  let legacyLocations: unknown[] = []
  try {
    const meta = script.metadata ? JSON.parse(script.metadata) : {}
    legacyLocations = meta.locations || []
  } catch { /* ignore */ }

  if (legacyLocations.length > 0) {
    // Migrate each legacy location to DB
    for (const raw of legacyLocations) {
      const loc = raw as Record<string, unknown>
      const name = (loc.name as string) || ""
      if (!name) continue
      try {
        await prisma.scriptLocation.upsert({
          where: { scriptId_name: { scriptId, name } },
          create: {
            scriptId, name,
            type: (loc.type as string) || "INT",
            description: (loc.description as string) || null,
            address: (loc.address as string) || null,
            contact: (loc.contact as string) || null,
            notes: (loc.notes as string) || null,
            photos: JSON.stringify(loc.photos || []),
            timeSlots: JSON.stringify(loc.timeSlots || []),
          },
          update: {
            description: (loc.description as string) || undefined,
            address: (loc.address as string) || undefined,
            contact: (loc.contact as string) || undefined,
            notes: (loc.notes as string) || undefined,
            photos: JSON.stringify(loc.photos || []),
            timeSlots: JSON.stringify(loc.timeSlots || []),
          },
        })
      } catch { /* skip duplicates */ }
    }
    // Re-read migrated data
    const migrated = await prisma.scriptLocation.findMany({
      where: { scriptId },
      select: {
        id: true, name: true, type: true, description: true,
        address: true, contact: true, notes: true,
        photos: true, timeSlots: true,
      },
      orderBy: { name: "asc" },
    })
    const locations = migrated.map(loc => ({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      description: loc.description || "",
      address: loc.address || "",
      contact: loc.contact || "",
      notes: loc.notes || "",
      photos: safeParseJson(loc.photos, []),
      timeSlots: safeParseJson(loc.timeSlots, []),
    }))
    return NextResponse.json({ locations })
  }

  return NextResponse.json({ locations: [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: scriptId } = await params

  // Verify ownership
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    select: { id: true },
  })
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { locations } = await req.json()
  if (!Array.isArray(locations)) return NextResponse.json({ error: "Invalid data" }, { status: 400 })

  for (const loc of locations) {
    const name = loc.name as string
    if (!name) continue
    await prisma.scriptLocation.upsert({
      where: { scriptId_name: { scriptId, name } },
      create: {
        scriptId, name,
        type: loc.type || "INT",
        description: loc.description || null,
        address: loc.address || null,
        contact: loc.contact || null,
        notes: loc.notes || null,
        photos: JSON.stringify(loc.photos || []),
        timeSlots: JSON.stringify(loc.timeSlots || []),
      },
      update: {
        type: loc.type || undefined,
        description: loc.description ?? undefined,
        address: loc.address ?? undefined,
        contact: loc.contact ?? undefined,
        notes: loc.notes ?? undefined,
        photos: JSON.stringify(loc.photos || []),
        timeSlots: JSON.stringify(loc.timeSlots || []),
      },
    })
  }

  return NextResponse.json({ success: true })
}

function safeParseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try { return JSON.parse(val) } catch { return fallback }
}
