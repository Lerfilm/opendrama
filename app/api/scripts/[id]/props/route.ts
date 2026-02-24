export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { resolveImageUrl } from "@/lib/storage"

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

  // Read from ScriptProp table
  const dbProps = await prisma.scriptProp.findMany({
    where: { scriptId },
    select: {
      id: true, name: true, category: true, description: true,
      isKey: true, quantity: true, source: true, notes: true,
      photos: true, sceneKeys: true,
    },
    orderBy: { name: "asc" },
  })

  if (dbProps.length > 0) {
    const props = dbProps.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category || "other",
      description: p.description || "",
      sceneIds: p.sceneKeys || [],
      photos: resolvePhotos(safeParseJson(p.photos, [])),
      isKey: p.isKey,
      quantity: p.quantity,
      source: p.source || "",
      notes: p.notes || "",
    }))
    return NextResponse.json({ props })
  }

  // Fallback: migrate legacy data from Script.metadata
  let legacyProps: unknown[] = []
  try {
    const meta = script.metadata ? JSON.parse(script.metadata) : {}
    legacyProps = meta.props || []
  } catch { /* ignore */ }

  if (legacyProps.length > 0) {
    for (const raw of legacyProps) {
      const p = raw as Record<string, unknown>
      const name = (p.name as string) || ""
      if (!name) continue
      try {
        await prisma.scriptProp.create({
          data: {
            scriptId, name,
            category: (p.category as string) || "other",
            description: (p.description as string) || null,
            isKey: (p.isKey as boolean) ?? false,
            quantity: typeof p.quantity === "number" ? p.quantity : null,
            source: (p.source as string) || null,
            notes: (p.notes as string) || null,
            photos: JSON.stringify(p.photos || []),
          },
        })
      } catch { /* skip if exists */ }
    }
    // Re-read migrated data
    const migrated = await prisma.scriptProp.findMany({
      where: { scriptId },
      select: {
        id: true, name: true, category: true, description: true,
        isKey: true, quantity: true, source: true, notes: true,
        photos: true, sceneKeys: true,
      },
      orderBy: { name: "asc" },
    })
    const props = migrated.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category || "other",
      description: p.description || "",
      sceneIds: p.sceneKeys || [],
      photos: resolvePhotos(safeParseJson(p.photos, [])),
      isKey: p.isKey,
      quantity: p.quantity,
      source: p.source || "",
      notes: p.notes || "",
    }))
    return NextResponse.json({ props })
  }

  return NextResponse.json({ props: [] })
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

  const { props } = await req.json()
  if (!Array.isArray(props)) return NextResponse.json({ error: "Invalid data" }, { status: 400 })

  for (const p of props) {
    const name = (p.name as string) || ""
    if (!name) continue

    // Real DB id (cuid) → update; temp id (prop-*) or missing → create
    const isRealId = p.id && typeof p.id === "string" && !p.id.startsWith("prop-")

    if (isRealId) {
      try {
        await prisma.scriptProp.update({
          where: { id: p.id },
          data: {
            name, category: p.category || "other",
            description: p.description || null,
            isKey: p.isKey ?? false,
            quantity: typeof p.quantity === "number" ? p.quantity : null,
            source: p.source || null,
            notes: p.notes || null,
            photos: JSON.stringify(p.photos || []),
          },
        })
      } catch {
        // If update fails (id doesn't exist), create
        await prisma.scriptProp.create({
          data: {
            scriptId, name, category: p.category || "other",
            description: p.description || null,
            isKey: p.isKey ?? false,
            quantity: typeof p.quantity === "number" ? p.quantity : null,
            source: p.source || null,
            notes: p.notes || null,
            photos: JSON.stringify(p.photos || []),
          },
        })
      }
    } else {
      await prisma.scriptProp.create({
        data: {
          scriptId, name, category: p.category || "other",
          description: p.description || null,
          isKey: p.isKey ?? false,
          quantity: typeof p.quantity === "number" ? p.quantity : null,
          source: p.source || null,
          notes: p.notes || null,
          photos: JSON.stringify(p.photos || []),
        },
      })
    }
  }

  // Handle deletions: remove props not in the submitted list
  const submittedIds = props.filter((p: Record<string, unknown>) => p.id && typeof p.id === "string" && !((p.id as string).startsWith("prop-"))).map((p: Record<string, unknown>) => p.id as string)
  if (submittedIds.length > 0) {
    await prisma.scriptProp.deleteMany({
      where: { scriptId, id: { notIn: submittedIds } },
    })
  }

  return NextResponse.json({ success: true })
}

function safeParseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try { return JSON.parse(val) } catch { return fallback }
}

function resolvePhotos(photos: Array<{ url?: string; [k: string]: unknown }>): typeof photos {
  return photos.map(p => p.url ? { ...p, url: resolveImageUrl(p.url) } : p)
}
