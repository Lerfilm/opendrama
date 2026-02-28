export const dynamic = "force-dynamic"
import prisma from "@/lib/prisma"
import { Star, Compass, Play } from "@/components/icons"
import Link from "next/link"
import Image from "next/image"
import { createT, getLocaleAsync } from "@/lib/i18n"
import { DiscoverSearch } from "./discover-search"
import { getGenreGradient } from "@/lib/genre-colors"
import { resolveImageUrl } from "@/lib/storage"

const GENRES = [
  { key: "all", label: "discover.allGenres" },
  { key: "drama", label: "discover.drama" },
  { key: "comedy", label: "discover.comedy" },
  { key: "romance", label: "discover.romance" },
  { key: "thriller", label: "discover.thriller" },
  { key: "fantasy", label: "discover.fantasy" },
  { key: "horror", label: "discover.horror" },
  { key: "action", label: "discover.action" },
  { key: "mystery", label: "discover.mystery" },
]

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genre?: string; tab?: string }>
}) {
  const t = createT(await getLocaleAsync())
  const params = await searchParams
  const query = params.q || ""
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
    orderBy: { viewCount: "desc" },
    take: 30,
  })

  // Resolve R2 image URLs through proxy
  const resolvedSeries = seriesList.map(s => ({
    ...s,
    coverUrl: resolveImageUrl(s.coverUrl),
    coverTall: resolveImageUrl(s.coverTall),
  }))

  // Get rating stats for all series
  const seriesIds = resolvedSeries.map(s => s.id)
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

  // Split into hot picks and new arrivals
  const hotPicks = resolvedSeries.slice(0, 6)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const newArrivals = resolvedSeries
    .filter(s => new Date(s.createdAt) > sevenDaysAgo)
    .slice(0, 6)
  // If not enough new arrivals, use remaining series
  const finalNewArrivals = newArrivals.length >= 3 ? newArrivals : resolvedSeries.slice(6, 12)

  return (
    <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 min-h-screen bg-gradient-to-b from-purple-950 via-[#1a0a2e] to-black text-white">
      <div className="px-4 pt-4 pb-24 md:px-6 md:pt-6 max-w-screen-lg mx-auto">

        {/* Search Bar */}
        <div className="mb-6">
          <DiscoverSearch defaultValue={query} variant="dark" />
        </div>

        {/* 🔥 Hot Picks Section */}
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span>🔥</span>
            <span>{t("home.hotPicks")}</span>
          </h2>
          {hotPicks.length === 0 ? (
            <div className="text-center py-16 text-white/40">
              <Compass className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{t("discover.noResults")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {hotPicks.map((series, index) => {
                const rating = ratingMap[series.id]
                const coverImage = resolveImageUrl(series.coverTall || series.coverUrl)

                return (
                  <Link key={series.id} href={`/series/${series.id}`}>
                    <div className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-purple-900/30
                                    hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300 hover:scale-[1.02]
                                    ring-1 ring-white/5">
                      {coverImage ? (
                        <Image
                          src={coverImage}
                          alt={series.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${getGenreGradient(series.genre)} flex flex-col items-center justify-center gap-2 px-3`}>
                          <Play className="w-8 h-8 text-white/40" />
                          <span className="text-white/50 text-xs text-center font-medium line-clamp-2">{series.title}</span>
                        </div>
                      )}
                      {/* Bottom gradient + title + stats */}
                      <div className="absolute bottom-0 left-0 right-0
                                      bg-gradient-to-t from-black/90 via-black/50 to-transparent
                                      px-3 pt-12 pb-3">
                        <h3 className="text-white font-bold text-xs leading-tight line-clamp-2 mb-1">
                          {series.title}
                        </h3>
                        <div className="flex items-center justify-between">
                          <p className="text-white/50 text-[10px]">
                            {series._count.episodes} {t("studio.episode", { num: series._count.episodes })}
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

        {/* Genre Tags */}
        <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar mb-6">
          {GENRES.map((g) => (
            <Link
              key={g.key}
              href={`/discover?genre=${g.key}${query ? `&q=${query}` : ""}`}
            >
              <div className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all border ${
                genre === g.key
                  ? "bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/20"
                  : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
              }`}>
                {t(g.label)}
              </div>
            </Link>
          ))}
        </div>

        {/* ✨ New Arrivals Section */}
        {finalNewArrivals.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span>✨</span>
              <span>{t("home.newArrivals")}</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {finalNewArrivals.map((series) => {
                const coverImage = resolveImageUrl(series.coverTall || series.coverUrl)
                return (
                  <Link key={series.id} href={`/series/${series.id}`}>
                    <div className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-purple-900/30
                                    hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300 hover:scale-[1.02]
                                    ring-1 ring-white/5">
                      {coverImage ? (
                        <Image
                          src={coverImage}
                          alt={series.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${getGenreGradient(series.genre)} flex flex-col items-center justify-center gap-2 px-3`}>
                          <Play className="w-8 h-8 text-white/40" />
                          <span className="text-white/50 text-xs text-center font-medium line-clamp-2">{series.title}</span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-12 pb-3">
                        <h3 className="text-white font-bold text-xs leading-tight line-clamp-2">{series.title}</h3>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* All Series (if filtered by genre or search) */}
        {(genre !== "all" || query) && resolvedSeries.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Compass className="w-5 h-5 text-purple-400" />
              <span>{t("discover.title")}</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {resolvedSeries.map((series) => {
                const coverImage = resolveImageUrl(series.coverTall || series.coverUrl)
                return (
                  <Link key={series.id} href={`/series/${series.id}`}>
                    <div className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-purple-900/30
                                    hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300 hover:scale-[1.02]
                                    ring-1 ring-white/5">
                      {coverImage ? (
                        <Image
                          src={coverImage}
                          alt={series.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${getGenreGradient(series.genre)} flex flex-col items-center justify-center gap-2 px-3`}>
                          <Play className="w-8 h-8 text-white/40" />
                          <span className="text-white/50 text-xs text-center font-medium line-clamp-2">{series.title}</span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-12 pb-3">
                        <h3 className="text-white font-bold text-xs leading-tight line-clamp-2">{series.title}</h3>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
