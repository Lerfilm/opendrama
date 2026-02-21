"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Heart, HeartFilled, Bookmark, BookmarkFilled, Share2 } from "@/components/icons"
import { t } from "@/lib/i18n"

interface SeriesActionsProps {
  seriesId: string
  initialLiked: boolean
  initialFavorited: boolean
  initialLikeCount: number
  initialFavoriteCount: number
  isLoggedIn: boolean
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function SeriesActions({
  seriesId,
  initialLiked,
  initialFavorited,
  initialLikeCount,
  initialFavoriteCount,
  isLoggedIn,
}: SeriesActionsProps) {
  const router = useRouter()
  const [liked, setLiked] = useState(initialLiked)
  const [favorited, setFavorited] = useState(initialFavorited)
  const [likeCount, setLikeCount] = useState(initialLikeCount)
  const [favoriteCount, setFavoriteCount] = useState(initialFavoriteCount)

  const handleLike = async () => {
    if (!isLoggedIn) {
      router.push("/auth/signin")
      return
    }

    // Optimistic update
    setLiked(!liked)
    setLikeCount(liked ? likeCount - 1 : likeCount + 1)

    try {
      const res = await fetch(`/api/series/${seriesId}/like`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setLiked(data.liked)
        setLikeCount(data.likeCount)
      }
    } catch {
      // Revert on error
      setLiked(liked)
      setLikeCount(likeCount)
    }
  }

  const handleFavorite = async () => {
    if (!isLoggedIn) {
      router.push("/auth/signin")
      return
    }

    setFavorited(!favorited)
    setFavoriteCount(favorited ? favoriteCount - 1 : favoriteCount + 1)

    try {
      const res = await fetch(`/api/series/${seriesId}/favorite`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setFavorited(data.favorited)
        setFavoriteCount(data.favoriteCount)
      }
    } catch {
      setFavorited(favorited)
      setFavoriteCount(favoriteCount)
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/series/${seriesId}`
    if (navigator.share) {
      try {
        await navigator.share({ url })
      } catch {}
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  return (
    <div className="flex items-center justify-center gap-8 py-3">
      {/* Like */}
      <button
        onClick={handleLike}
        className="flex flex-col items-center gap-1 transition-transform active:scale-90"
      >
        {liked ? (
          <HeartFilled className="w-6 h-6 text-red-500" />
        ) : (
          <Heart className="w-6 h-6 text-muted-foreground" />
        )}
        <span className={`text-xs font-medium ${liked ? "text-red-500" : "text-muted-foreground"}`}>
          {formatCount(likeCount)}
        </span>
      </button>

      {/* Favorite */}
      <button
        onClick={handleFavorite}
        className="flex flex-col items-center gap-1 transition-transform active:scale-90"
      >
        {favorited ? (
          <BookmarkFilled className="w-6 h-6 text-yellow-500" />
        ) : (
          <Bookmark className="w-6 h-6 text-muted-foreground" />
        )}
        <span className={`text-xs font-medium ${favorited ? "text-yellow-500" : "text-muted-foreground"}`}>
          {formatCount(favoriteCount)}
        </span>
      </button>

      {/* Share */}
      <button
        onClick={handleShare}
        className="flex flex-col items-center gap-1 transition-transform active:scale-90"
      >
        <Share2 className="w-6 h-6 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {t("series.share")}
        </span>
      </button>
    </div>
  )
}
