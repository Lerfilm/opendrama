export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { DevDashboardClient } from "./dashboard-client"

export default async function DevDashboard() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  // Active projects (not deleted)
  const scripts = await prisma.script.findMany({
    where: { userId: session.user.id as string, deletedAt: null },
    include: {
      _count: { select: { scenes: true, roles: true, videoSegments: true } },
    },
    orderBy: { updatedAt: "desc" },
  })

  // Trash: deleted within the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const trashedScripts = await prisma.script.findMany({
    where: {
      userId: session.user.id as string,
      deletedAt: { not: null, gte: thirtyDaysAgo },
    },
    include: {
      _count: { select: { scenes: true, roles: true, videoSegments: true } },
    },
    orderBy: { deletedAt: "desc" },
  })

  return (
    <DevDashboardClient
      scripts={scripts as Parameters<typeof DevDashboardClient>[0]["scripts"]}
      trashedScripts={trashedScripts as Parameters<typeof DevDashboardClient>[0]["trashedScripts"]}
    />
  )
}
