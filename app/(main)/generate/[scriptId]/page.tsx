export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, CheckCircle, Loader2, Play } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

export default async function GenerateScriptPage({
  params,
}: {
  params: Promise<{ scriptId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const { scriptId } = await params
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: session.user.id },
    include: {
      scenes: { orderBy: [{ episodeNum: "asc" }, { sortOrder: "asc" }] },
      videoSegments: { select: { episodeNum: true, status: true } },
    },
  })

  if (!script) notFound()

  // Group scenes by episode
  const episodeMap: Record<number, number> = {}
  for (const scene of script.scenes) {
    episodeMap[scene.episodeNum] = (episodeMap[scene.episodeNum] || 0) + 1
  }
  const episodes = Object.keys(episodeMap).map(Number).sort((a, b) => a - b)

  // Group video segments by episode
  const segmentMap: Record<number, { total: number; done: number; generating: number; pending: number }> = {}
  for (const seg of script.videoSegments) {
    if (!segmentMap[seg.episodeNum]) segmentMap[seg.episodeNum] = { total: 0, done: 0, generating: 0, pending: 0 }
    segmentMap[seg.episodeNum].total++
    if (seg.status === "done") segmentMap[seg.episodeNum].done++
    if (seg.status === "generating" || seg.status === "submitted") segmentMap[seg.episodeNum].generating++
    if (seg.status === "pending") segmentMap[seg.episodeNum].pending++
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/studio">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{script.title}</h1>
          <p className="text-xs text-muted-foreground">
            {t("studio.goToTheater")} — {t("studio.episode", { num: script.targetEpisodes })}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t("series.episodeList")}</h2>

        {episodes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <p>{t("studio.noScripts")}</p>
              <p className="text-xs mt-1">{t("studio.noScriptsHint")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {episodes.map((ep) => {
              const sceneCount = episodeMap[ep] || 0
              const segInfo = segmentMap[ep]
              const isDone = segInfo && segInfo.done > 0 && segInfo.done === segInfo.total
              const isGenerating = segInfo && segInfo.generating > 0
              const hasPending = segInfo && segInfo.pending > 0

              return (
                <Link key={ep} href={`/generate/${scriptId}/${ep}`}>
                  <Card className={`hover:shadow-md transition-shadow cursor-pointer ${isDone ? "border-green-200 dark:border-green-800" : ""}`}>
                    <CardContent className="p-4 text-center space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-lg font-bold">{t("studio.episode", { num: ep })}</span>
                        {isDone && <CheckCircle className="w-4 h-4 text-green-500" />}
                        {isGenerating && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("studio.sceneCount", { count: sceneCount })}
                      </p>
                      {segInfo && segInfo.done > 0 && (
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-green-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${segInfo.total > 0 ? (segInfo.done / segInfo.total) * 100 : 0}%` }}
                          />
                        </div>
                      )}
                      {hasPending && !isGenerating && !isDone && (
                        <Badge className="text-[10px] bg-green-100 text-green-700">
                          {t("generate.readyBadge")}
                        </Badge>
                      )}
                      {!segInfo && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {t("studio.needsSegments")}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
