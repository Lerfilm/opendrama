export const dynamic = "force-dynamic"
import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Play } from "@/components/icons"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"
import { t } from "@/lib/i18n"
import { DiscoverSearch } from "./discover-search"

const GENRES = [
  { key: "all", label: "discover.allGenres" },
  { key: "drama", label: "discover.drama" },
  { key: "comedy", label: "discover.comedy" },
  { key: "romance", label: "discover.romance" },
  { key: "thriller", label: "discover.thriller" },
  { key: "fantasy", label: "discover.fantasy" },
]

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genre?: string; tab?: string }>
}) {
  const params = await searchParams
  const query = params.q || ""
  const tab = params.tab || "trending"
  const genre = params.genre || "all"

  const where: Record<string, unknown> = { status: "active" }
  if (query) {
    where.title = { contains: query, mode: "insensitive" }
  }

  const seriesList = await prisma.series.findMany({
    where,
    select: {
      id: true,
      title: true,
      coverUrl: true,
      description: true,
      createdAt: true,
      _count: { select: { episodes: true } },
    },
    orderBy: tab === "latest" ? { createdAt: "desc" } : { createdAt: "desc" },
    take: 30,
  })

  // 统计每个系列的观看数
  const episodeList = await prisma.episode.findMany({
    where: { seriesId: { in: seriesList.map((s) => s.id) } },
    select: { id: true, seriesId: true },
  })
  const watchCounts = await prisma.watchEvent.groupBy({
    by: ["episodeId"],
    _count: { id: true },
  })
  const viewMap: Record<string, number> = {}
  for (const ep of episodeList) {
    const cnt = watchCounts.find((w) => w.episodeId === ep.id)?._count.id || 0
    viewMap[ep.seriesId] = (viewMap[ep.seriesId] || 0) + cnt
  }

  const sorted =
    tab === "trending"
      ? [...seriesList].sort((a, b) => (viewMap[b.id] || 0) - (viewMap[a.id] || 0))
      : seriesList

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">{t("discover.title")}</h1>

      <DiscoverSearch defaultValue={query} />

      {/* 分类标签 */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {GENRES.map((g) => (
          <Link
            key={g.key}
            href={`/discover?genre=${g.key}&tab=${tab}${query ? `&q=${query}` : ""}`}
          >
            <Button
              variant={genre === g.key ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap"
            >
              {t(g.label)}
            </Button>
          </Link>
        ))}
      </div>

      {/* 热门/最新 */}
      <div className="flex gap-2 border-b border-border">
        {["trending", "latest"].map((t2) => (
          <Link
            key={t2}
            href={`/discover?tab=${t2}${genre !== "all" ? `&genre=${genre}` : ""}${query ? `&q=${query}` : ""}`}
          >
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t2
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`discover.${t2}`)}
            </button>
          </Link>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("discover.noResults")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sorted.map((series) => (
            <Link key={series.id} href={`/series/${series.id}`}>
              <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="p-0">
                  <div className="relative aspect-[2/3] bg-muted">
                    {series.coverUrl ? (
                      <Image
                        src={series.coverUrl}
                        alt={series.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                        {t("common.noCover")}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-white text-xs">
                        {t("discover.viewCount", { count: viewMap[series.id] || 0 })}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  <h3 className="font-medium text-sm line-clamp-2 mb-1">{series.title}</h3>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t("home.episodeCount", { count: series._count.episodes })}
                    </p>
                    <Play className="w-4 h-4 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
