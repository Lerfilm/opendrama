"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Lock, Loader2, Unlock, Coins } from "@/components/icons"
import { t } from "@/lib/i18n"
import Link from "next/link"

interface EpisodeUnlockDialogProps {
  open: boolean
  onClose: () => void
  episodeId: string
  episodeTitle: string
  episodeNum: number
  unlockCost: number
  userCoins: number
  seriesId: string
  onUnlocked: (episodeId: string, cost: number) => void
}

export default function EpisodeUnlockDialog({
  open,
  onClose,
  episodeId,
  episodeTitle,
  episodeNum,
  unlockCost,
  userCoins,
  seriesId,
  onUnlocked,
}: EpisodeUnlockDialogProps) {
  const [loading, setLoading] = useState(false)

  async function handleUnlock() {
    setLoading(true)
    try {
      const res = await fetch("/api/episode/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      })

      if (res.ok) {
        onUnlocked(episodeId, unlockCost)
      } else {
        const data = await res.json()
        alert(data.error || t("episode.unlockFailed"))
      }
    } catch {
      alert(t("episode.unlockFailedRetry"))
    } finally {
      setLoading(false)
    }
  }

  const canAfford = userCoins >= unlockCost

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-center">{episodeTitle}</DialogTitle>
          <DialogDescription className="text-center">
            {t("series.episode", { num: episodeNum })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("episode.unlock")}</span>
            <Badge variant="secondary" className="text-base px-3 py-1">
              <Coins className="w-4 h-4 mr-1" />
              {t("recharge.coinsAmount", { coins: unlockCost })}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("episode.currentBalance")}</span>
            <span className="font-semibold">
              {t("recharge.coinsAmount", { coins: userCoins })}
            </span>
          </div>
        </div>

        {canAfford ? (
          <Button
            onClick={handleUnlock}
            disabled={loading}
            size="lg"
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("episode.unlocking")}
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4 mr-2" />
                {t("episode.unlockCost", { cost: unlockCost })}
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-500 text-center">
              {t("episode.insufficientCoins")}
            </p>
            <Link href="/recharge" className="block">
              <Button className="w-full" size="lg">
                {t("home.rechargeNow")}
              </Button>
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
