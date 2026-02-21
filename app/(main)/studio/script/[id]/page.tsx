export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { t } from "@/lib/i18n"
import { ScriptEditor } from "./script-editor"

export default async function ScriptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const { id } = await params
  const script = await prisma.script.findFirst({
    where: { id, userId: session.user.id },
    include: {
      scenes: { orderBy: [{ episodeNum: "asc" }, { sortOrder: "asc" }] },
      roles: { orderBy: { createdAt: "asc" } },
      videoSegments: {
        orderBy: [{ episodeNum: "asc" }, { segmentIndex: "asc" }],
        select: {
          id: true, episodeNum: true, segmentIndex: true,
          durationSec: true, prompt: true, shotType: true,
          cameraMove: true, model: true, resolution: true, status: true,
        },
      },
    },
  })

  if (!script) notFound()

  return (
    <div className="p-4 pb-24">
      <ScriptEditor
        script={JSON.parse(JSON.stringify(script))}
      />
    </div>
  )
}
