"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import MuxPlayer from "@mux/mux-player-react"
import { useRouter } from "next/navigation"
import { useSwipe } from "@/hooks/use-swipe"
import { useWatchTracker } from "@/hooks/use-watch-tracker"
import { CardDropModal } from "./card-drop-modal"
import { Button } from "./ui/button"
import {
  ArrowLeft,
  Heart,
  HeartFilled,
  MessageCircle,
  Share2,
  Bookmark,
  BookmarkFilled,
  Lock,
  Coins,
  ChevronUp,
  ChevronDown,
} from "./icons"
import { t } from "@/lib/i18n"
import DanmakuOverlay from "./danmaku-overlay"
import DanmakuInput from "./danmaku-input"

interface Episode {
  id: string
  title: string
  episodeNum: number
  muxPlaybackId: string | null
  unlockCost: number
  isUnlocked: boolean
  isFree: boolean
}

interface SwipePlayerProps {
  seriesId: string
  seriesTitle: string
  episodes: Episode[]
  userId: string
  initialEpisodeNum?: number
  userCoins: number
}

export function SwipePlayer({
  seriesId,
  seriesTitle,
  episodes,
  userId,
  initialEpisodeNum = 1,
  userCoins,
}: SwipePlayerProps) {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = episodes.findIndex((ep) => ep.episodeNum === initialEpisodeNum)
    return idx >= 0 ? idx : 0
  })
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [liked, setLiked] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [coins, setCoins] = useState(userCoins)
  const [danmakuEnabled, setDanmakuEnabled] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentEpisode = episodes[currentIndex]
  const hasNext = currentIndex < episodes.length - 1
  const hasPrev = currentIndex > 0
  const isPlayable = currentEpisode?.isUnlocked || currentEpisode?.isFree

  // Watch tracker hook
  const {
    droppedCard,
    showCardModal,
    setShowCardModal,
    loadPosition,
  } = useWatchTracker({
    episodeId: currentEpisode?.id || "",
    userId,
    getCurrentTime: () => playerRef.current?.currentTime || 0,
    getDuration: () => playerRef.current?.duration || 0,
    isPaused: () => playerRef.current?.paused ?? true,
  })

  // Load watch position on episode change
  useEffect(() => {
    if (isPlayable && currentEpisode?.muxPlaybackId) {
      loadPosition().then((pos) => {
        if (pos > 0 && playerRef.current) {
          // Wait for player to be ready
          const checkReady = setInterval(() => {
            if (playerRef.current && playerRef.current.duration > 0) {
              playerRef.current.currentTime = pos
              clearInterval(checkReady)
            }
          }, 200)
          // Timeout safety
          setTimeout(() => clearInterval(checkReady), 5000)
        }
      })
    }
  }, [currentIndex, isPlayable, currentEpisode?.muxPlaybackId, loadPosition])

  // Load like/bookmark status
  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch(`/api/series/${seriesId}/like`, { method: "GET" })
        if (res.ok) {
          const data = await res.json()
          setLiked(data.liked)
          setLikeCount(data.count || 0)
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch(`/api/series/${seriesId}/favorite`, { method: "GET" })
        if (res.ok) {
          const data = await res.json()
          setBookmarked(data.favorited)
        }
      } catch { /* ignore */ }
    }
    loadStatus()
  }, [seriesId])

  // Swipe navigation
  const goToNext = useCallback(() => {
    if (!hasNext || isTransitioning) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => prev + 1)
    setTimeout(() => setIsTransitioning(false), 300)
  }, [hasNext, isTransitioning])

  const goToPrev = useCallback(() => {
    if (!hasPrev || isTransitioning) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => prev - 1)
    setTimeout(() => setIsTransitioning(false), 300)
  }, [hasPrev, isTransitioning])

  const { onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
    onSwipeUp: goToNext,
    onSwipeDown: goToPrev,
    threshold: 60,
    enabled: !isTransitioning,
  })

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false)
    }, 4000)
  }, [])

  // Toggle controls on tap
  const handleTap = useCallback(() => {
    if (showControls) {
      setShowControls(false)
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    } else {
      resetControlsTimer()
    }
  }, [showControls, resetControlsTimer])

  // Like toggle
  const handleLike = async () => {
    setLiked(!liked)
    setLikeCount((c) => (liked ? c - 1 : c + 1))
    try {
      await fetch(`/api/series/${seriesId}/like`, { method: "POST" })
    } catch { /* revert on error would be ideal */ }
  }

  // Bookmark toggle
  const handleBookmark = async () => {
    setBookmarked(!bookmarked)
    try {
      await fetch(`/api/series/${seriesId}/favorite`, { method: "POST" })
    } catch { /* ignore */ }
  }

  // Share
  const handleShare = async () => {
    const url = `${window.location.origin}/series/${seriesId}?ep=${currentEpisode.episodeNum}`
    const text = t("share.template", {
      title: seriesTitle,
      num: currentEpisode.episodeNum,
    })
    try {
      if (navigator.share) {
        await navigator.share({ title: seriesTitle, text, url })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch { /* ignore */ }
  }

  // Unlock episode
  const handleUnlock = async () => {
    if (coins < currentEpisode.unlockCost) {
      router.push("/recharge")
      return
    }
    try {
      const res = await fetch("/api/episode/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: currentEpisode.id }),
      })
      if (res.ok) {
        setCoins((c) => c - currentEpisode.unlockCost)
        // Reload to get updated unlock status
        router.refresh()
      }
    } catch { /* ignore */ }
  }

  return (
    <div
      className="fixed inset-0 bg-black z-50 select-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={handleTap}
    >
      {/* ===== Top overlay ===== */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3 px-4 pt-3 pb-8 safe-area-inset-top">
          <button
            onClick={(e) => {
              e.stopPropagation()
              router.back()
            }}
            className="p-1.5 rounded-full bg-white/10 backdrop-blur-sm"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">
              {seriesTitle}
            </p>
            <p className="text-white/60 text-xs">
              {t("player.episode", { num: currentEpisode?.episodeNum || 1 })}
              {currentEpisode?.title ? ` · ${currentEpisode.title}` : ""}
            </p>
          </div>
          {/* Danmaku toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setDanmakuEnabled((prev) => !prev)
            }}
            className={`px-2 py-1 rounded-full text-[10px] font-medium ${
              danmakuEnabled ? "bg-white/20 text-white" : "bg-white/10 text-white/40"
            }`}
          >
            {t("danmaku.toggle")} {danmakuEnabled ? t("danmaku.on") : t("danmaku.off")}
          </button>
        </div>
      </div>

      {/* ===== Video area ===== */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isPlayable && currentEpisode?.muxPlaybackId ? (
          <MuxPlayer
            key={currentEpisode.id}
            ref={playerRef}
            playbackId={currentEpisode.muxPlaybackId}
            metadata={{
              video_title: `${seriesTitle} - ${currentEpisode.title}`,
              viewer_user_id: userId,
            }}
            streamType="on-demand"
            autoPlay
            onTimeUpdate={() => {
              if (playerRef.current) {
                setCurrentTime(playerRef.current.currentTime || 0)
              }
            }}
            style={{
              width: "100%",
              height: "100%",
              maxWidth: "100vw",
              aspectRatio: "9/16",
              // Hide default Mux controls — we use our own overlay
              "--controls": "none",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any}
          />
        ) : (
          /* Locked episode view */
          <div className="flex flex-col items-center justify-center text-white text-center px-8">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6">
              <Lock className="w-10 h-10 text-white/60" />
            </div>
            <h3 className="text-xl font-bold mb-2">
              {t("player.episode", { num: currentEpisode?.episodeNum || 0 })}
            </h3>
            <p className="text-white/60 text-sm mb-6">
              {currentEpisode?.title}
            </p>
            <div className="flex items-center gap-2 mb-4">
              <Coins className="w-5 h-5 text-yellow-400" />
              <span className="text-lg font-bold">
                {currentEpisode?.unlockCost} {t("common.coins")}
              </span>
            </div>
            <p className="text-white/40 text-xs mb-6">
              {t("watch.balance", { count: coins })}
            </p>
            <Button
              onClick={(e) => {
                e.stopPropagation()
                handleUnlock()
              }}
              className="rounded-full px-8 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold text-base"
            >
              {coins >= (currentEpisode?.unlockCost || 0)
                ? t("watch.unlockToWatch")
                : t("watch.rechargeToWatch")}
            </Button>
          </div>
        )}
      </div>

      {/* ===== Danmaku Overlay ===== */}
      {isPlayable && currentEpisode && (
        <DanmakuOverlay
          episodeId={currentEpisode.id}
          currentTime={currentTime}
          enabled={danmakuEnabled}
        />
      )}

      {/* ===== Right side action bar (TikTok style) ===== */}
      <div
        className={`absolute right-3 bottom-32 z-30 flex flex-col items-center gap-5 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-70"
        }`}
      >
        {/* Like */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleLike()
          }}
          className="flex flex-col items-center gap-1"
        >
          {liked ? (
            <HeartFilled className="w-7 h-7 text-red-500" />
          ) : (
            <Heart className="w-7 h-7 text-white" />
          )}
          <span className="text-white text-[10px]">{likeCount || ""}</span>
        </button>

        {/* Comment */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/series/${seriesId}#comments`)
          }}
          className="flex flex-col items-center gap-1"
        >
          <MessageCircle className="w-7 h-7 text-white" />
          <span className="text-white text-[10px]">{t("watch.comment")}</span>
        </button>

        {/* Bookmark */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleBookmark()
          }}
          className="flex flex-col items-center gap-1"
        >
          {bookmarked ? (
            <BookmarkFilled className="w-7 h-7 text-yellow-400" />
          ) : (
            <Bookmark className="w-7 h-7 text-white" />
          )}
        </button>

        {/* Share */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleShare()
          }}
          className="flex flex-col items-center gap-1"
        >
          <Share2 className="w-7 h-7 text-white" />
        </button>
      </div>

      {/* ===== Bottom overlay ===== */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="px-4 pb-6 pt-16 safe-area-inset-bottom">
          {/* Episode title */}
          <p className="text-white font-semibold text-sm mb-1">
            {currentEpisode?.title}
          </p>
          <p className="text-white/50 text-xs mb-3">
            {t("player.episode", { num: currentEpisode?.episodeNum || 0 })} / {episodes.length}
          </p>

          {/* Danmaku input */}
          {isPlayable && currentEpisode && (
            <div className="mb-2">
              <DanmakuInput
                episodeId={currentEpisode.id}
                currentTime={currentTime}
              />
            </div>
          )}

          {/* Swipe hints */}
          <div className="flex items-center justify-center gap-6 text-white/30 text-[10px]">
            {hasPrev && (
              <span className="flex items-center gap-1">
                <ChevronDown className="w-3 h-3" /> {t("watch.prevEp")}
              </span>
            )}
            {hasNext && (
              <span className="flex items-center gap-1">
                <ChevronUp className="w-3 h-3" /> {t("watch.nextEp")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===== Card Drop Modal ===== */}
      {droppedCard && (
        <CardDropModal
          card={droppedCard}
          open={showCardModal}
          onClose={() => setShowCardModal(false)}
        />
      )}
    </div>
  )
}
