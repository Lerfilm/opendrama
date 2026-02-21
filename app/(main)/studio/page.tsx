export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, CheckCircle } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

export default async function StudioPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const scripts = await prisma.script.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { scenes: true, roles: true, videoSegments: true } },
    },
  })

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    generating: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    published: "bg-blue-100 text-blue-700",
  }

  const genreLabels: Record<string, string> = {
    drama: "discover.drama",
    comedy: "discover.comedy",
    romance: "discover.romance",
    thriller: "discover.thriller",
    scifi: "discover.fantasy",
    fantasy: "discover.fantasy",
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("studio.title")}</h1>
      </div>

      {/* 快捷入口 */}
      <Link href="/studio/script/new">
        <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Edit className="w-6 h-6 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold">{t("studio.newScript")}</span>
              <p className="text-xs text-muted-foreground">{t("studio.emptySceneDesc")}</p>
            </div>
            <Plus className="w-5 h-5 text-muted-foreground ml-auto shrink-0" />
          </CardContent>
        </Card>
      </Link>

      {/* 我的剧本列表 */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("studio.myScripts")}</h2>

        {scripts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <p className="mb-1">{t("studio.noScripts")}</p>
              <p className="text-sm">{t("studio.noScriptsHint")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {scripts.map((script) => (
              <Link key={script.id} href={`/studio/script/${script.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{script.title}</h3>
                          <Badge
                            variant="secondary"
                            className={statusColors[script.status] || ""}
                          >
                            {t(`studio.${script.status}`)}
                          </Badge>
                        </div>
                        {script.logline && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                            {script.logline}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                          <span>{t(genreLabels[script.genre] || "discover.drama")}</span>
                          <span>{t("studio.episode", { num: script.targetEpisodes })}</span>
                          <span>{script._count.scenes} {t("studio.scenes")}</span>
                          <span>{script._count.roles} {t("studio.roles")}</span>
                        </div>
                        {/* Mini workflow progress */}
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <div className={`flex items-center gap-0.5 ${script._count.scenes > 0 ? "text-green-600" : "text-muted-foreground/50"}`}>
                            {script._count.scenes > 0 ? (
                              <CheckCircle className="w-3 h-3" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center"><span className="text-[7px]">1</span></div>
                            )}
                            <span>{t("studio.workflowScenes")}</span>
                          </div>
                          <div className="w-3 h-px bg-muted-foreground/30" />
                          <div className={`flex items-center gap-0.5 ${script._count.videoSegments > 0 ? "text-green-600" : "text-muted-foreground/50"}`}>
                            {script._count.videoSegments > 0 ? (
                              <CheckCircle className="w-3 h-3" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center"><span className="text-[7px]">2</span></div>
                            )}
                            <span>{t("studio.workflowSegments")}</span>
                          </div>
                          <div className="w-3 h-px bg-muted-foreground/30" />
                          <div className="flex items-center gap-0.5 text-muted-foreground/50">
                            <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center"><span className="text-[7px]">3</span></div>
                            <span>{t("studio.workflowTheater")}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
