export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { DevDashboardClient } from "./dashboard-client"

export default async function DevDashboard() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const scripts = await prisma.script.findMany({
    where: { userId: session.user.id as string },
    include: {
      _count: { select: { scenes: true, roles: true, videoSegments: true } },
    },
    orderBy: { updatedAt: "desc" },
  })

  return <DevDashboardClient scripts={scripts as Parameters<typeof DevDashboardClient>[0]["scripts"]} />
}
