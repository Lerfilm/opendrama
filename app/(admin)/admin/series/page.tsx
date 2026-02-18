export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2 } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

export default async function AdminSeriesPage() {
  const seriesList = await prisma.series.findMany({
    include: {
      episodes: {
        select: { id: true },
      },
      _count: {
        select: { episodes: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t("admin.series.title")}</h1>
          <p className="text-muted-foreground">
            {t("admin.series.desc")}
          </p>
        </div>
        <Link href="/admin/series/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            {t("admin.series.create")}
          </Button>
        </Link>
      </div>

      {seriesList.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {t("admin.series.noSeries")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {seriesList.map((series) => (
            <Card key={series.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4 flex-1">
                    {series.coverUrl && (
                      <img
                        src={series.coverUrl}
                        alt={series.title}
                        className="w-24 h-32 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold">
                          {series.title}
                        </h3>
                        <Badge
                          variant={
                            series.status === "active"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {series.status === "active" ? t("admin.series.online") : t("admin.series.offline")}
                        </Badge>
                      </div>
                      {series.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {series.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{t("home.episodeCount", { count: series._count.episodes })}</span>
                        <span>
                          {t("admin.series.createdAt")}
                          {new Date(series.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/admin/series/${series.id}`}>
                      <Button variant="outline" size="sm">
                        <Edit className="w-4 h-4 mr-1" />
                        {t("common.edit")}
                      </Button>
                    </Link>
                    <Button variant="outline" size="sm">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
