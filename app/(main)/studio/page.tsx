export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { CheckCircle, Code, Plus, PenTool, Users, Video, Send, Sparkles } from "@/components/icons"
import Link from "next/link"
import { createT, getLocaleAsync } from "@/lib/i18n"

export default async function StudioPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")
  const t = createT(await getLocaleAsync())

  const scripts = await prisma.script.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { scenes: true, roles: true, videoSegments: true } },
      scenes: { select: { episodeNum: true }, distinct: ["episodeNum"] },
    },
  })

  const genreLabels: Record<string, string> = {
    drama: "discover.drama",
    comedy: "discover.comedy",
    romance: "discover.romance",
    thriller: "discover.thriller",
    scifi: "discover.fantasy",
    fantasy: "discover.fantasy",
  }

  return (
    <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 min-h-screen bg-gradient-to-b from-indigo-950 via-[#0a0a2e] to-black text-white">
      <div className="px-4 pt-5 pb-24 md:px-6 md:pt-6 max-w-screen-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              {t("studio.title")}
            </h1>
            <p className="text-white/40 text-xs mt-0.5">{t("studio.tagline")}</p>
          </div>
          <Link href="/studio/script/new">
            <div className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-lg shadow-violet-500/20">
              <Plus className="w-4 h-4" />
              {t("studio.newScript")}
            </div>
          </Link>
        </div>

        {/* Pro Workspace Banner (Desktop only) */}
        <div className="hidden md:block mb-6">
          <Link href="/dev">
            <div className="relative bg-gradient-to-r from-indigo-800/60 to-violet-800/40 rounded-2xl p-4 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-indigo-500/10 transition-all group border border-white/5">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-6 translate-x-6" />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/30 flex items-center justify-center border border-indigo-400/20">
                    <Code className="w-4 h-4 text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="text-white/80 font-semibold text-sm">{t("studio.proWorkspace")}</h3>
                    <p className="text-white/40 text-xs">{t("studio.proWorkspaceDesc")}</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Pipeline Visualization */}
        <div className="mb-6 flex items-center justify-between px-2">
          {[
            { icon: PenTool, label: t("studio.pipelineScript"), done: true },
            { icon: Users, label: t("studio.pipelineCast"), done: true },
            { icon: Video, label: t("studio.pipelineVideo"), done: false },
            { icon: Send, label: t("studio.pipelinePublish"), done: false },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                  step.done
                    ? "bg-green-500/20 border-green-500/30 shadow-lg shadow-green-500/10"
                    : "bg-white/5 border-white/10"
                }`}>
                  <step.icon className={`w-4 h-4 ${step.done ? "text-green-400" : "text-white/30"}`} />
                </div>
                <span className={`text-[9px] font-medium ${step.done ? "text-green-400/80" : "text-white/30"}`}>{step.label}</span>
              </div>
              {i < 3 && (
                <div className={`w-6 h-px mt-[-14px] ${step.done ? "bg-green-500/30" : "bg-white/10"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Script List */}
        <div>
          <h2 className="text-sm font-bold text-white/60 mb-3 uppercase tracking-wider">{t("studio.myScripts")}</h2>

          {scripts.length === 0 ? (
            <div className="rounded-2xl bg-white/5 border border-white/5 p-8 text-center">
              <PenTool className="w-8 h-8 mx-auto mb-3 text-violet-400/30" />
              <p className="text-white/40 text-sm mb-1">{t("studio.noScripts")}</p>
              <p className="text-white/25 text-xs">{t("studio.noScriptsHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scripts.map((script) => {
                const sceneDone = script._count.scenes > 0
                const segDone = script._count.videoSegments > 0
                const isGenerating = script.status === "generating"

                return (
                  <Link key={script.id} href={`/studio/script/${script.id}`}>
                    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 hover:bg-white/[0.07] transition-all group">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-white/90 text-sm">{script.title}</h3>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              script.status === "completed" ? "bg-green-500/20 text-green-400" :
                              script.status === "generating" ? "bg-violet-500/20 text-violet-400" :
                              script.status === "published" ? "bg-blue-500/20 text-blue-400" :
                              "bg-white/10 text-white/50"
                            }`}>
                              {t(`studio.${script.status}`)}
                            </span>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-white/15 group-hover:text-white/40 transition-colors mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      {script.logline && (
                        <p className="text-white/30 text-xs line-clamp-1 mb-2">{script.logline}</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-white/30 mb-2">
                        <span>{t(genreLabels[script.genre] || "discover.drama")}</span>
                        <span>{t("studio.episode", { num: script.targetEpisodes })}</span>
                        <span>{script._count.scenes} {t("studio.scenes")}</span>
                        <span>{script._count.roles} {t("studio.roles")}</span>
                      </div>
                      {/* Mini workflow progress */}
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <div className={`flex items-center gap-0.5 ${sceneDone ? "text-green-400" : "text-white/20"}`}>
                          {sceneDone ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-current" />
                          )}
                          <span>{t("studio.workflowScenes")}</span>
                        </div>
                        <div className={`w-4 h-px ${sceneDone ? "bg-green-500/30" : "bg-white/10"}`} />
                        <div className={`flex items-center gap-0.5 ${segDone ? "text-green-400" : isGenerating ? "text-violet-400 animate-pulse" : "text-white/20"}`}>
                          {segDone ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-current" />
                          )}
                          <span>{t("studio.workflowSegments")}</span>
                        </div>
                        <div className={`w-4 h-px ${segDone ? "bg-green-500/30" : "bg-white/10"}`} />
                        <div className="flex items-center gap-0.5 text-white/20">
                          <div className="w-3 h-3 rounded-full border border-current" />
                          <span>{t("studio.workflowTheater")}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
