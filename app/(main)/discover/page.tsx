export const dynamic = "force-dynamic"
import prisma from "@/lib/prisma"
import { Star } from "@/components/icons"
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

const TABS = [
  { key: "trending", label: "discover.trending" },
  { key: "topRated", label: "discover.topRated" },
  { key: "latest", label: "discover.latest" },
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
  if (genre !== "all") {
    where.genre = genre
  }

  const seriesList = await prisma.series.findMany({
    where,
    select: {
      id: true,
      title: true,
      coverUrl: true,
      coverTall: true,
      description: true,
      genre: true,
      viewCount: true,
      createdAt: true,
      user: { select: { id: true, name: true, image: true } },
      _count: { select: { episodes: true } },
    },
    orderBy: tab === "latest" ? { createdAt: "desc" } : { viewCount: "desc" },
    take: 30,
  })

  // Get rating stats for all series
  const seriesIds = seriesList.map(s => s.id)
  const ratingStats = await prisma.seriesRating.groupBy({
    by: ["seriesId"],
    where: { seriesId: { in: seriesIds } },
    _avg: { rating: true },
    _count: { rating: true },
  })
  const ratingMap: Record<string, { avg: number; count: number }> = {}
  for (const r of ratingStats) {
    ratingMap[r.seriesId] = {
      avg: Math.round((r._avg.rating || 0) * 10) / 10,
      count: r._count.rating,
    }
  }

  // Get like counts
  const likeCounts = await prisma.seriesLike.groupBy({
    by: ["seriesId"],
    where: { seriesId: { in: seriesIds } },
    _count: { id: true },
  })
  const likeMap: Record<string, number> = {}
  for (const l of likeCounts) {
    likeMap[l.seriesId] = l._count.id
  }

  // Sort based on tab
  let sorted = [...seriesList]
  if (tab === "trending") {
    sorted.sort((a, b) => {
      const scoreA = a.viewCount + (likeMap[a.id] || 0) * 2
      const scoreB = b.viewCount + (likeMap[b.id] || 0) * 2
      return scoreB - scoreA
    })
  } else if (tab === "topRated") {
    sorted = sorted
      .filter(s => (ratingMap[s.id]?.count || 0) >= 1)
      .sort((a, b) => (ratingMap[b.id]?.avg || 0) - (ratingMap[a.id]?.avg || 0))
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">{t("discover.title")}</h1>

      <DiscoverSearch defaultValue={query} />

      {/* Genre tags */}
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {TABS.map((t2) => (
          <Link
            key={t2.key}
            href={`/discover?tab=${t2.key}${genre !== "all" ? `&genre=${genre}` : ""}${query ? `&q=${query}` : ""}`}
          >
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t2.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(t2.label)}
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
          {sorted.map((series) => {
            const rating = ratingMap[series.id]

            return (
              <Link key={series.id} href={`/series/${series.id}`}>
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-muted hover:shadow-lg transition-shadow">
                  {(series.coverTall || series.coverUrl) ? (
                    <Image
                      src={series.coverTall || series.coverUrl!}
                      alt={series.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center text-white/30 text-sm">
                      {t("common.noCover")}
                    </div>
                  )}
                  {/* Bottom gradient + title + stats */}
                  <div className="absolute bottom-0 left-0 right-0
                                  bg-gradient-to-t from-black/80 via-black/40 to-transparent
                                  px-2.5 pt-8 pb-2.5">
                    <h3 className="text-white font-bold text-xs leading-tight line-clamp-2 mb-1">
                      {series.title}
                    </h3>
                    <div className="flex items-center justify-between">
                      <p className="text-white/70 text-[10px]">
                        {t("discover.viewCount", { count: series.viewCount })}
                      </p>
                      {rating && rating.count > 0 && (
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-amber-400" />
                          <span className="text-white text-[10px] font-medium">{rating.avg}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
