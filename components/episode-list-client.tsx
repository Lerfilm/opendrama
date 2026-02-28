"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Coins, Lock } from "@/components/icons"
import { t } from "@/lib/i18n"
import EpisodePlayerDialog from "@/components/episode-player-dialog"
import EpisodeUnlockDialog from "@/components/episode-unlock-dialog"

interface Episode {
  id: string
  title: string
  episodeNum: number
  duration: number | null
  unlockCost: number
  muxPlaybackId: string | null
}

interface EpisodeListClientProps {
  seriesId: string
  episodes: Episode[]
  unlockedEpisodeIds: string[]
  userId: string | null
  userCoins: number
}

export default function EpisodeListClient({
  seriesId,
  episodes,
  unlockedEpisodeIds,
  userId,
  userCoins: initialCoins,
}: EpisodeListClientProps) {
  const router = useRouter()
  const [activeEpisode, setActiveEpisode] = useState<Episode | null>(null)
  const [showPlayer, setShowPlayer] = useState(false)
  const [showUnlock, setShowUnlock] = useState(false)
  const [unlockedIds, setUnlockedIds] = useState<string[]>(unlockedEpisodeIds)
  const [coins, setCoins] = useState(initialCoins)

  function isAccessible(ep: Episode): boolean {
    return ep.episodeNum <= 5 || unlockedIds.includes(ep.id)
  }

  function handleEpisodeClick(ep: Episode) {
    if (isAccessible(ep)) {
      // Navigate to swipe player for immersive viewing
      router.push(`/watch/${seriesId}?ep=${ep.episodeNum}`)
    } else {
      // Need to unlock
      if (!userId) {
        router.push("/auth/signin")
        return
      }
      setActiveEpisode(ep)
      setShowUnlock(true)
    }
  }

  function handleUnlocked(episodeId: string, cost: number) {
    setUnlockedIds((prev) => [...prev, episodeId])
    setCoins((prev) => prev - cost)
    setShowUnlock(false)
    // Auto-open player after unlock
    setShowPlayer(true)
  }

  function handleClosePlayer() {
    setShowPlayer(false)
    setActiveEpisode(null)
  }

  function handleCloseUnlock() {
    setShowUnlock(false)
    setActiveEpisode(null)
  }

  // Navigate to prev/next episode from player
  function getPlayableNeighbor(direction: "prev" | "next"): Episode | null {
    if (!activeEpisode) return null
    const idx = episodes.findIndex((e) => e.id === activeEpisode.id)
    const targetIdx = direction === "prev" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= episodes.length) return null
    const target = episodes[targetIdx]
    return isAccessible(target) ? target : null
  }

  function handlePrev() {
    const prev = getPlayableNeighbor("prev")
    if (prev) setActiveEpisode(prev)
  }

  function handleNext() {
    const next = getPlayableNeighbor("next")
    if (next) setActiveEpisode(next)
  }

  return (
    <>
      <div className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("series.episodeList")}</h2>
        <div className="space-y-2">
          {episodes.map((episode) => {
            const accessible = isAccessible(episode)
            const isFreeEpisode = episode.episodeNum <= 5

            return (
              <div
                key={episode.id}
                className="block cursor-pointer"
                onClick={() => handleEpisodeClick(episode)}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">
                            {t("series.episode", { num: episode.episodeNum })}
                          </span>
                          {isFreeEpisode && (
                            <Badge variant="secondary" className="text-xs">
                              {t("common.free")}
                            </Badge>
                          )}
                          {!isFreeEpisode && unlockedIds.includes(episode.id) && (
                            <Badge variant="secondary" className="text-xs">
                              {t("common.unlocked")}
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-medium text-sm mb-1">
                          {episode.title}
                        </h3>
                        {episode.duration && (
                          <p className="text-xs text-muted-foreground">
                            {t("series.minutes", { min: Math.floor(episode.duration / 60) })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {accessible ? (
                          <Button size="sm" variant="default">
                            <Play className="w-4 h-4 mr-1" />
                            {t("common.play")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline">
                            <Coins className="w-4 h-4 mr-1" />
                            {t("recharge.coinsAmount", { coins: episode.unlockCost })}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      </div>

      {/* Player Dialog */}
      {activeEpisode && showPlayer && userId && (
        <EpisodePlayerDialog
          open={showPlayer}
          onClose={handleClosePlayer}
          episode={activeEpisode}
          userId={userId}
          onPrev={handlePrev}
          onNext={handleNext}
          hasPrev={!!getPlayableNeighbor("prev")}
          hasNext={!!getPlayableNeighbor("next")}
        />
      )}

      {/* Unlock Dialog */}
      {activeEpisode && showUnlock && (
        <EpisodeUnlockDialog
          open={showUnlock}
          onClose={handleCloseUnlock}
          episodeId={activeEpisode.id}
          episodeTitle={activeEpisode.title}
          episodeNum={activeEpisode.episodeNum}
          unlockCost={activeEpisode.unlockCost}
          userCoins={coins}
          seriesId={seriesId}
          onUnlocked={handleUnlocked}
        />
      )}
    </>
  )
}
