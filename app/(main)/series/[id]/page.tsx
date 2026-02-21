export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Eye } from "@/components/icons"
import Image from "next/image"
import type { Metadata } from "next"
import { t } from "@/lib/i18n"
import SeriesActions from "@/components/series-actions"
import StarRating from "@/components/star-rating"
import CommentSection from "@/components/comment-section"
import SeriesTags from "@/components/series-tags"
import SeriesViewTracker from "./view-tracker"
import EpisodeListClient from "@/components/episode-list-client"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const series = await prisma.series.findUnique({
    where: { id },
    select: { title: true, description: true, coverUrl: true },
  })

  if (!series) return { title: t("series.notFound") }

  return {
    title: series.title,
    description: series.description || t("series.watchAt", { title: series.title }),
    openGraph: {
      title: series.title,
      description: series.description || t("series.watchAt", { title: series.title }),
      images: series.coverUrl ? [{ url: series.coverUrl }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: series.title,
      description: series.description || t("series.watchAt", { title: series.title }),
      images: series.coverUrl ? [series.coverUrl] : [],
    },
  }
}

function formatViewCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default async function SeriesDetailPage({ params }: Props) {
  const { id } = await params
  const session = await auth()
  const userId = session?.user?.id

  // Fetch series with all related data
  const series = await prisma.series.findUnique({
    where: { id },
    include: {
      episodes: {
        orderBy: { episodeNum: "asc" },
        select: {
          id: true,
          title: true,
          episodeNum: true,
          duration: true,
          unlockCost: true,
          muxPlaybackId: true,
        },
      },
    },
  })

  if (!series) {
    notFound()
  }

  // Parallel data fetching for stats, user state, and coins
  const [
    unlockedEpisodeIds,
    userCoins,
    likeCount,
    favoriteCount,
    ratingAgg,
    commentCount,
    comments,
    userLike,
    userFavorite,
    userRating,
  ] = await Promise.all([
    userId
      ? prisma.episodeUnlock
          .findMany({ where: { userId }, select: { episodeId: true } })
          .then((u) => u.map((x) => x.episodeId))
      : Promise.resolve([]),
    userId
      ? prisma.user.findUnique({ where: { id: userId }, select: { coins: true } }).then((u) => u?.coins || 0)
      : Promise.resolve(0),
    prisma.seriesLike.count({ where: { seriesId: id } }),
    prisma.seriesFavorite.count({ where: { seriesId: id } }),
    prisma.seriesRating.aggregate({
      where: { seriesId: id },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.seriesComment.count({ where: { seriesId: id } }),
    prisma.seriesComment.findMany({
      where: { seriesId: id },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    userId ? prisma.seriesLike.findUnique({ where: { userId_seriesId: { userId, seriesId: id } } }) : null,
    userId ? prisma.seriesFavorite.findUnique({ where: { userId_seriesId: { userId, seriesId: id } } }) : null,
    userId ? prisma.seriesRating.findUnique({ where: { userId_seriesId: { userId, seriesId: id } } }) : null,
  ])

  const avgRating = Math.round((ratingAgg._avg.rating || 0) * 10) / 10
  const totalRatings = ratingAgg._count.rating

  return (
    <div className="pb-4">
      {/* View tracker (auto-increment on page load) */}
      <SeriesViewTracker seriesId={id} />

      {/* Cover area */}
      <div className="relative h-48 sm:h-64 bg-gradient-to-b from-black/60 to-background">
        {series.coverUrl && (
          <Image
            src={series.coverUrl}
            alt={series.title}
            fill
            className="object-cover -z-10"
            priority
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background to-transparent">
          <h1 className="text-2xl font-bold mb-2">{series.title}</h1>
          {series.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {series.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Badge>{t("home.episodeCount", { count: series.episodes.length })}</Badge>
            <Badge variant="outline">{series.status === "active" ? t("common.ongoing") : t("common.completed")}</Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <Eye className="w-3.5 h-3.5" />
              {t("series.views", { count: formatViewCount(series.viewCount) })}
            </div>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="px-4 pt-3">
        <SeriesTags genre={series.genre} tags={series.tags} />
      </div>

      {/* Like / Favorite / Share */}
      <div className="px-4">
        <SeriesActions
          seriesId={id}
          initialLiked={!!userLike}
          initialFavorited={!!userFavorite}
          initialLikeCount={likeCount}
          initialFavoriteCount={favoriteCount}
          isLoggedIn={!!userId}
        />
      </div>

      {/* Star Rating */}
      <div className="px-4 border-t border-b">
        <StarRating
          seriesId={id}
          initialAvgRating={avgRating}
          initialTotalRatings={totalRatings}
          initialUserRating={userRating?.rating || null}
          isLoggedIn={!!userId}
        />
      </div>

      {/* Episode List (Client Component with inline player) */}
      <EpisodeListClient
        seriesId={id}
        episodes={series.episodes}
        unlockedEpisodeIds={unlockedEpisodeIds}
        userId={userId || null}
        userCoins={userCoins}
      />

      {/* Comments Section */}
      <div className="px-4 pb-4">
        <CommentSection
          seriesId={id}
          initialComments={comments.map((c) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt.toISOString(),
            user: c.user,
          }))}
          initialTotal={commentCount}
          isLoggedIn={!!userId}
          currentUserId={userId}
        />
      </div>
    </div>
  )
}
