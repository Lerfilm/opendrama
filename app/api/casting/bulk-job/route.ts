export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET /api/casting/bulk-job?scriptId=X[&type=optional]
// Returns active (pending/processing) bulk jobs for this script.
// If ?type= is provided, filters by that exact type.
// Without ?type=, falls back to casting job types only (backward compat).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scriptId = req.nextUrl.searchParams.get("scriptId")
  if (!scriptId) return NextResponse.json({ error: "scriptId required" }, { status: 400 })

  const typeFilter = req.nextUrl.searchParams.get("type")

  const jobs = await prisma.aIJob.findMany({
    where: {
      userId: session.user.id,
      scriptId,
      ...(typeFilter
        ? { type: typeFilter }
        : { type: { in: ["fill_all_specs", "generate_all_portraits"] } }),
      status: { in: ["pending", "processing"] },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ jobs })
}

// POST /api/casting/bulk-job
// Create a new bulk job.
// Body: { scriptId, type, roleIds?: string[], locIds?: string[] }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scriptId, type, roleIds, locIds } = await req.json()
  const itemIds = roleIds ?? locIds
  if (!scriptId || !type || !itemIds?.length) {
    return NextResponse.json({ error: "scriptId, type, and roleIds/locIds required" }, { status: 400 })
  }

  // Cancel any existing job of the same type for this script
  await prisma.aIJob.updateMany({
    where: {
      userId: session.user.id,
      scriptId,
      type,
      status: { in: ["pending", "processing"] },
    },
    data: { status: "failed" },
  })

  // Store the appropriate key in input JSON
  const inputData = roleIds ? { roleIds } : { locIds }

  const job = await prisma.aIJob.create({
    data: {
      userId: session.user.id,
      scriptId,
      type,
      status: "processing",
      input: JSON.stringify(inputData),
      output: JSON.stringify(roleIds ? { completedRoleIds: [] } : { completedLocIds: [] }),
      progress: 0,
      startedAt: new Date(),
    },
  })

  return NextResponse.json({ job })
}

// PATCH /api/casting/bulk-job
// Mark an item as completed, update progress.
// Body: { jobId, completedRoleId?, completedLocId?, progress }
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { jobId, completedRoleId, completedLocId, progress } = await req.json()
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 })

  const job = await prisma.aIJob.findFirst({
    where: { id: jobId, userId: session.user.id },
  })
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })

  // Parse existing output and append completed item
  let outputData: { completedRoleIds?: string[]; completedLocIds?: string[] } = {}
  try { outputData = JSON.parse(job.output || "{}") } catch { /* ok */ }

  if (completedRoleId && !outputData.completedRoleIds?.includes(completedRoleId)) {
    outputData.completedRoleIds = [...(outputData.completedRoleIds ?? []), completedRoleId]
  }
  if (completedLocId && !outputData.completedLocIds?.includes(completedLocId)) {
    outputData.completedLocIds = [...(outputData.completedLocIds ?? []), completedLocId]
  }

  const updated = await prisma.aIJob.update({
    where: { id: jobId },
    data: {
      output: JSON.stringify(outputData),
      progress: progress ?? job.progress,
    },
  })

  return NextResponse.json({ job: updated })
}

// DELETE /api/casting/bulk-job?jobId=X
// Mark job as completed
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 })

  await prisma.aIJob.updateMany({
    where: { id: jobId, userId: session.user.id },
    data: { status: "completed", completedAt: new Date(), progress: 100 },
  })

  return NextResponse.json({ ok: true })
}
