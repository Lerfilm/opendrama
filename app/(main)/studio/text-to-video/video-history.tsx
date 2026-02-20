import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, RefreshCw, Video } from "@/components/icons"
import { t } from "@/lib/i18n"

export async function VideoHistory({ userId }: { userId: string }) {
  const jobs = await prisma.aIJob.findMany({
    where: {
      userId,
      type: { in: ["video_compose", "text_to_video"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: t("purchases.pending"), className: "bg-yellow-100 text-yellow-700" },
    processing: { label: t("t2v.generating"), className: "bg-blue-100 text-blue-700 animate-pulse" },
    completed: { label: t("purchases.success"), className: "bg-green-100 text-green-700" },
    failed: { label: t("purchases.failed"), className: "bg-red-100 text-red-700" },
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">{t("t2v.myVideos")}</h2>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t("t2v.noVideos")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const input = job.input ? JSON.parse(job.input) : {}
            const output = job.output ? JSON.parse(job.output) : {}
            const status = statusConfig[job.status] || statusConfig.pending

            return (
              <Card key={job.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex gap-3 p-3">
                    {/* 视频预览缩略图 */}
                    <div className="relative w-20 h-28 rounded-lg overflow-hidden bg-gradient-to-br from-purple-900 to-pink-900 flex-shrink-0">
                      {output.thumbnailUrl ? (
                        <img
                          src={output.thumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-6 h-6 text-white/50" />
                        </div>
                      )}
                      <div className="absolute top-1 right-1">
                        <Badge className={`text-[9px] px-1 py-0 ${status.className}`}>
                          {status.label}
                        </Badge>
                      </div>
                      {input.duration && (
                        <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1">
                          <span className="text-[10px] text-white">{input.duration}s</span>
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2 mb-1">{input.prompt || "..."}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        {input.style && <span>{input.style}</span>}
                        {input.aspectRatio && <span>{input.aspectRatio}</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  {job.status === "completed" && output.videoUrl && (
                    <div className="flex border-t border-border">
                      <a
                        href={output.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t("t2v.download")}
                      </a>
                      <div className="w-px bg-border" />
                      <button className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <RefreshCw className="w-3.5 h-3.5" />
                        {t("t2v.regenerate")}
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
