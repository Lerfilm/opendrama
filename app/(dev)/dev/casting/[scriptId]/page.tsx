export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { CastingWorkspace } from "./casting-workspace"

export default async function CastingPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id as string },
    include: {
      roles: { orderBy: { createdAt: "asc" } },
    },
  })

  if (!script) redirect("/dev")

  return <CastingWorkspace script={script as Parameters<typeof CastingWorkspace>[0]["script"]} />
}
