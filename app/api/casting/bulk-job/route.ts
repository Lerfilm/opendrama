export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET /api/casting/bulk-job?scriptId=X
// Returns active (pending/processing) bulk casting jobs for this script
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scriptId = req.nextUrl.searchParams.get("scriptId")
  if (!scriptId) return NextResponse.json({ error: "scriptId required" }, { status: 400 })

  const jobs = await prisma.aIJob.findMany({
    where: {
      userId: session.user.id,
      scriptId,
      type: { in: ["fill_all_specs", "generate_all_portraits"] },
      status: { in: ["pending", "processing"] },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ jobs })
}

// POST /api/casting/bulk-job
// Create a new bulk job
// Body: { scriptId, type: "fill_all_specs" | "generate_all_portraits", roleIds: string[] }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scriptId, type, roleIds } = await req.json()
  if (!scriptId || !type || !roleIds?.length) {
    return NextResponse.json({ error: "scriptId, type, roleIds required" }, { status: 400 })
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

  const job = await prisma.aIJob.create({
    data: {
      userId: session.user.id,
      scriptId,
      type,
      status: "processing",
      input: JSON.stringify({ roleIds }),
      output: JSON.stringify({ completedRoleIds: [] }),
      progress: 0,
      startedAt: new Date(),
    },
  })

  return NextResponse.json({ job })
}

// PATCH /api/casting/bulk-job
// Mark a role as completed, update progress
// Body: { jobId, completedRoleId, progress }
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { jobId, completedRoleId, progress } = await req.json()
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 })

  const job = await prisma.aIJob.findFirst({
    where: { id: jobId, userId: session.user.id },
  })
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })

  // Append completedRoleId to output
  let outputData: { completedRoleIds: string[] } = { completedRoleIds: [] }
  try { outputData = JSON.parse(job.output || "{}") } catch { /* ok */ }
  if (completedRoleId && !outputData.completedRoleIds.includes(completedRoleId)) {
    outputData.completedRoleIds.push(completedRoleId)
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
// Mark job as completed (or failed)
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
