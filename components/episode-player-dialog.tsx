"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { VideoPlayer } from "@/components/video-player"
import { Button } from "@/components/ui/button"
import { XIcon, ArrowLeft, Play } from "@/components/icons"
import { t } from "@/lib/i18n"

interface Episode {
  id: string
  title: string
  episodeNum: number
  muxPlaybackId: string | null
}

interface EpisodePlayerDialogProps {
  open: boolean
  onClose: () => void
  episode: Episode
  userId: string
  onPrev?: () => void
  onNext?: () => void
  hasPrev: boolean
  hasNext: boolean
}

export default function EpisodePlayerDialog({
  open,
  onClose,
  episode,
  userId,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: EpisodePlayerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-full w-full h-[100dvh] p-0 bg-black border-none rounded-none gap-0 sm:max-w-full"
      >
        {/* Top overlay bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <div className="flex items-center justify-between p-3 pointer-events-auto max-w-screen-sm mx-auto">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={onClose}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>

            <div className="text-white text-sm font-medium">
              {t("player.episode", { num: episode.episodeNum })} · {episode.title}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={onClose}
            >
              <XIcon className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Video player */}
        {episode.muxPlaybackId ? (
          <VideoPlayer
            key={episode.id}
            playbackId={episode.muxPlaybackId}
            episodeId={episode.id}
            userId={userId}
            title={episode.title}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/60">
            <div className="text-center">
              <Play className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t("player.noVideo")}</p>
            </div>
          </div>
        )}

        {/* Bottom episode navigation */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
          <div className="flex items-center justify-between p-4 pointer-events-auto max-w-screen-sm mx-auto">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 disabled:opacity-30"
              disabled={!hasPrev}
              onClick={onPrev}
            >
              {t("player.prev")}
            </Button>

            <span className="text-white/50 text-xs">
              {t("player.episode", { num: episode.episodeNum })}
            </span>

            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 disabled:opacity-30"
              disabled={!hasNext}
              onClick={onNext}
            >
              {t("player.next")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
