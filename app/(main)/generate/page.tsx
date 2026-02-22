export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Film, CheckCircle, Loader2, Zap, PenTool, XIcon, Radio } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

export default async function TheaterPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const scripts = await prisma.script.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      videoSegments: {
        select: { episodeNum: true, status: true },
      },
      _count: { select: { scenes: true } },
      // Get the linked series + its episodes to know Mux publish state
      seriesLink: {
        select: {
          id: true,
          episodes: {
            select: { episodeNum: true, muxPlaybackId: true },
          },
        },
      },
    },
  })

  // Process each script's stats
  const scriptsWithStats = scripts.map((script) => {
    const segs = script.videoSegments

    // Segment-level counts (for generating/failed badge)
    const generating = segs.filter(
      (s) => s.status === "generating" || s.status === "submitted" || s.status === "reserved"
    ).length
    const failed = segs.filter((s) => s.status === "failed").length
    const pending = segs.filter((s) => s.status === "pending").length

    // Episode-level counts
    const episodeNumsWithSegments = [...new Set(segs.map((s) => s.episodeNum))].sort((a, b) => a - b)
    const totalEpisodes = episodeNumsWithSegments.length

    // Episodes where ALL segments are done (locally generated)
    const doneSegsByEp = new Map<number, number>()
    const totalSegsByEp = new Map<number, number>()
    for (const s of segs) {
      totalSegsByEp.set(s.episodeNum, (totalSegsByEp.get(s.episodeNum) ?? 0) + 1)
      if (s.status === "done") {
        doneSegsByEp.set(s.episodeNum, (doneSegsByEp.get(s.episodeNum) ?? 0) + 1)
      }
    }
    const episodesLocallyDone = episodeNumsWithSegments.filter(
      (ep) => (doneSegsByEp.get(ep) ?? 0) > 0 && doneSegsByEp.get(ep) === totalSegsByEp.get(ep)
    ).length

    // Episodes pushed to Mux (have muxPlaybackId)
    const muxEpisodes = script.seriesLink?.episodes ?? []
    const episodesOnMux = muxEpisodes.filter((e) => !!e.muxPlaybackId).length

    return {
      ...script,
      segmentStats: {
        totalEpisodes,
        episodesLocallyDone,
        episodesOnMux,
        generating,
        failed,
        pending,
      },
    }
  })

  // Separate: scripts with segments vs without
  const scriptsReady = scriptsWithStats.filter((s) => s.segmentStats.totalEpisodes > 0)
  const scriptsEmpty = scriptsWithStats.filter((s) => s.segmentStats.totalEpisodes === 0)

  return (
    <div className="space-y-6 p-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("theater.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("theater.subtitle")}</p>
        </div>
      </div>

      {/* Scripts with segments — ready for production */}
      {scriptsReady.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3">{t("theater.selectScript")}</h2>
          <div className="space-y-3">
            {scriptsReady.map((script) => {
              const { totalEpisodes, episodesLocallyDone, episodesOnMux, generating, failed, pending } =
                script.segmentStats

              // Status logic (mutually exclusive, priority order)
              const isGenerating = generating > 0
              const isOnAir = episodesOnMux > 0 && episodesOnMux < totalEpisodes
              const isCompleted = episodesOnMux > 0 && episodesOnMux >= totalEpisodes
              const hasPending = pending > 0
              const hasFailed = failed > 0

              return (
                <Link key={script.id} href={`/generate/${script.id}`}>
                  <Card
                    className={`hover:shadow-md transition-shadow ${
                      isCompleted
                        ? "border-green-200 dark:border-green-800"
                        : isOnAir
                        ? "border-blue-200 dark:border-blue-800"
                        : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold truncate">{script.title}</h3>

                            {isCompleted && (
                              <Badge className="text-[10px] bg-green-100 text-green-700 shrink-0">
                                <CheckCircle className="w-3 h-3 mr-0.5" />
                                {t("common.completed")}
                              </Badge>
                            )}
                            {isOnAir && (
                              <Badge className="text-[10px] bg-blue-100 text-blue-700 shrink-0">
                                <Radio className="w-3 h-3 mr-0.5" />
                                {t("common.ongoing")}
                              </Badge>
                            )}
                            {isGenerating && (
                              <Badge className="text-[10px] bg-amber-100 text-amber-700 shrink-0">
                                <Loader2 className="w-3 h-3 mr-0.5 animate-spin" />
                                {t("common.processing")}
                              </Badge>
                            )}
                            {hasPending && !isGenerating && !isOnAir && !isCompleted && (
                              <Badge className="text-[10px] bg-blue-100 text-blue-700 shrink-0">
                                <Zap className="w-3 h-3 mr-0.5" />
                                {t("generate.readyBadge")}
                              </Badge>
                            )}
                            {hasFailed && !isGenerating && (
                              <Badge className="text-[10px] bg-red-100 text-red-700 shrink-0">
                                <XIcon className="w-3 h-3 mr-0.5" />
                                {failed} {t("common.failed")}
                              </Badge>
                            )}
                          </div>
                          {script.logline && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                              {script.logline}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Progress bar — by episodes pushed to Mux */}
                      {totalEpisodes > 0 && (
                        <div className="space-y-1">
                          <div className="w-full bg-muted rounded-full h-1.5">
                            {/* Base bar: locally-done episodes (green) */}
                            <div className="relative w-full h-1.5 rounded-full overflow-hidden bg-muted">
                              {/* Locally done (lighter green) */}
                              <div
                                className="absolute inset-y-0 left-0 bg-green-300 dark:bg-green-700 transition-all"
                                style={{ width: `${(episodesLocallyDone / totalEpisodes) * 100}%` }}
                              />
                              {/* On Mux (solid green) */}
                              <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 to-green-600 transition-all"
                                style={{ width: `${(episodesOnMux / totalEpisodes) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {t("theater.episodeProgress", {
                                published: episodesOnMux,
                                total: totalEpisodes,
                              })}
                            </span>
                            {episodesLocallyDone > episodesOnMux && (
                              <span className="text-green-600 dark:text-green-400">
                                {t("theater.readyToPush", { count: episodesLocallyDone - episodesOnMux })}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Scripts without segments */}
      {scriptsEmpty.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground">
            {t("studio.needsSegments")}
          </h2>
          <div className="space-y-2">
            {scriptsEmpty.map((script) => (
              <Link key={script.id} href={`/studio/script/${script.id}`}>
                <Card className="hover:shadow-md transition-shadow opacity-70 hover:opacity-100">
                  <CardContent className="p-3 flex items-center gap-3">
                    <PenTool className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium truncate">{script.title}</h3>
                      <p className="text-[10px] text-muted-foreground">
                        {script._count.scenes} {t("studio.scenes").toLowerCase()} · {t("studio.episode", { num: script.targetEpisodes })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                      {t("studio.needsSegments")}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — no scripts at all */}
      {scripts.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Film className="w-10 h-10 text-muted-foreground mx-auto" />
            <h2 className="font-semibold">{t("theater.noScripts")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("generate.noSegmentsHint")}
            </p>
            <Link href="/studio">
              <button className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                <PenTool className="w-4 h-4" />
                {t("home.startCreate")}
              </button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
