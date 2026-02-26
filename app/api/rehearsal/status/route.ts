export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { queryVideoTask } from "@/lib/video-generation"
import { confirmDeduction, refundReservation } from "@/lib/tokens"

const STALE_TIMEOUT_MS = 45 * 60 * 1000 // 45 minutes

/**
 * GET /api/rehearsal/status — poll all active rehearsals for the current user
 * Syncs with provider and returns updated list.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rehearsals = await prisma.rehearsal.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  // Sync active rehearsals with provider
  const active = rehearsals.filter(
    (r) =>
      (r.status === "submitted" || r.status === "generating") &&
      r.providerTaskId &&
      r.model
  )

  const now = Date.now()

  for (const r of active) {
    // Auto-fail stale tasks — use updatedAt (tracks when status changed to submitted/generating)
    const ageMs = now - new Date(r.updatedAt).getTime()
    if (ageMs > STALE_TIMEOUT_MS) {
      if (r.tokenCost) {
        await refundReservation(session.user.id, r.tokenCost, `Rehearsal stale timeout: ${r.id}`)
      }
      await prisma.rehearsal.update({
        where: { id: r.id },
        data: { status: "failed", errorMessage: "Generation timed out (45min)" },
      })
      continue
    }

    try {
      const result = await queryVideoTask(r.model, r.providerTaskId!)

      if (result.status === "done" && result.videoUrl) {
        // Confirm token deduction
        if (r.tokenCost) {
          await confirmDeduction(session.user.id, r.tokenCost, { rehearsalId: r.id, type: "rehearsal" })
        }
        await prisma.rehearsal.update({
          where: { id: r.id },
          data: {
            status: "done",
            videoUrl: result.videoUrl,
            completedAt: new Date(),
          },
        })
      } else if (result.status === "failed") {
        // Refund tokens
        if (r.tokenCost) {
          await refundReservation(session.user.id, r.tokenCost, `Rehearsal failed: ${r.id}`)
        }
        await prisma.rehearsal.update({
          where: { id: r.id },
          data: {
            status: "failed",
            errorMessage: result.error || "Generation failed",
          },
        })
      } else if (result.status === "generating" && r.status === "submitted") {
        await prisma.rehearsal.update({
          where: { id: r.id },
          data: { status: "generating" },
        })
      }
    } catch {
      // Polling error — ignore, will retry next poll
    }
  }

  // Re-fetch updated data
  const updated = await prisma.rehearsal.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ rehearsals: updated })
}
