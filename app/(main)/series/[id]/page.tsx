export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { resolveImageUrl } from "@/lib/storage"
import { Badge } from "@/components/ui/badge"
import { Eye, Star, User as UserIcon } from "@/components/icons"
import Image from "next/image"
import type { Metadata } from "next"
import { t } from "@/lib/i18n"
import SeriesActions from "@/components/series-actions"
import StarRating from "@/components/star-rating"
import CommentSection from "@/components/comment-section"
import SeriesTags from "@/components/series-tags"
import SeriesViewTracker from "./view-tracker"
import EpisodeListClient from "@/components/episode-list-client"
import ExpandableSynopsis from "@/components/expandable-synopsis"
import CastSection from "@/components/cast-section"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const series = await prisma.series.findUnique({
    where: { id },
    select: {
      title: true, description: true, synopsis: true,
      coverUrl: true, coverWide: true,
      user: { select: { name: true } },
    },
  })

  if (!series) return { title: t("series.notFound") }

  const desc = series.synopsis || series.description || t("series.watchAt", { title: series.title })
  const ogImage = series.coverWide || series.coverUrl

  return {
    title: `${series.title}${series.user?.name ? ` · ${series.user.name}` : ""}`,
    description: desc,
    openGraph: {
      title: series.title,
      description: desc,
      images: ogImage ? [{ url: ogImage }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: series.title,
      description: desc,
      images: ogImage ? [ogImage] : [],
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

  // Fetch series with creator, cast, and episodes
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
      user: {
        select: { id: true, name: true, image: true },
      },
      script: {
        select: {
          synopsis: true,
          roles: {
            select: { id: true, name: true, role: true, description: true, avatarUrl: true },
            orderBy: { createdAt: "asc" },
          },
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
  const heroImage = resolveImageUrl(series.coverWide || series.coverUrl)
  const synopsisText = series.synopsis || series.script?.synopsis || series.description || ""
  const castRoles = (series.script?.roles || []).map(r => ({
    ...r,
    avatarUrl: resolveImageUrl(r.avatarUrl),
  }))
  const createdYear = series.createdAt.getFullYear()

  return (
    <div className="pb-4">
      {/* View tracker */}
      <SeriesViewTracker seriesId={id} />

      {/* ── Hero Section (Netflix-style wide backdrop) ── */}
      <div className="relative h-[300px] sm:h-[380px] lg:h-[460px] -mx-4 -mt-4 overflow-hidden">
        {heroImage ? (
          <Image
            src={heroImage}
            alt={series.title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-stone-900 to-stone-950" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        {/* Content at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 space-y-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">{series.title}</h1>

          {/* Meta line: genre · year · episodes · rating */}
          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground flex-wrap">
            {series.genre && (
              <Badge variant="outline" className="text-[10px] md:text-xs">{series.genre}</Badge>
            )}
            <span>{createdYear}</span>
            <span>·</span>
            <span>{t("home.episodeCount", { count: series.episodes.length })}</span>
            <span>·</span>
            <Badge variant="outline" className="text-[10px] md:text-xs">
              {series.status === "active" ? t("common.ongoing") : t("common.completed")}
            </Badge>
            {avgRating > 0 && (
              <>
                <span>·</span>
                <div className="flex items-center gap-0.5">
                  <Star className="w-3 h-3 md:w-4 md:h-4 text-amber-400" />
                  <span className="font-medium text-foreground">{avgRating}</span>
                </div>
              </>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <Eye className="w-3.5 h-3.5" />
              {formatViewCount(series.viewCount)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Creator / Director ── */}
      <div className="px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">
        {series.user ? (
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {series.user.image ? (
              <Image
                src={series.user.image}
                alt={series.user.name || ""}
                width={36}
                height={36}
                className="rounded-full shrink-0 ring-2 ring-background"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                {(series.user.name || "?")[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("series.createdBy")}</p>
              <p className="text-sm font-medium truncate">{series.user.name || t("series.anonymous")}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("series.anonymous")}</p>
          </div>
        )}
      </div>

      {/* ── Actions (Like / Favorite / Share) ── */}
      <div className="px-4 md:px-6">
        <SeriesActions
          seriesId={id}
          initialLiked={!!userLike}
          initialFavorited={!!userFavorite}
          initialLikeCount={likeCount}
          initialFavoriteCount={favoriteCount}
          isLoggedIn={!!userId}
        />
      </div>

      {/* ── Tags ── */}
      <div className="px-4 md:px-6 pt-1">
        <SeriesTags genre={series.genre} tags={series.tags} />
      </div>

      {/* ── Synopsis ── */}
      {synopsisText && (
        <div className="px-4 md:px-6 py-3 md:py-4">
          <h3 className="text-sm md:text-base font-semibold mb-2">{t("series.synopsis")}</h3>
          <ExpandableSynopsis text={synopsisText} maxLines={3} />
        </div>
      )}

      {/* ── Cast & Characters ── */}
      <CastSection roles={castRoles} />

      {/* ── Star Rating ── */}
      <div className="px-4 md:px-6 border-t border-b">
        <StarRating
          seriesId={id}
          initialAvgRating={avgRating}
          initialTotalRatings={totalRatings}
          initialUserRating={userRating?.rating || null}
          isLoggedIn={!!userId}
        />
      </div>

      {/* ── Episode List ── */}
      <EpisodeListClient
        seriesId={id}
        episodes={series.episodes}
        unlockedEpisodeIds={unlockedEpisodeIds}
        userId={userId || null}
        userCoins={userCoins}
      />

      {/* ── Comments ── */}
      <div className="px-4 md:px-6 pb-4">
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
