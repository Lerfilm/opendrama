"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2, Unlock } from "@/components/icons"
import { t } from "@/lib/i18n"

interface UnlockButtonProps {
  episodeId: string
  cost: number
  seriesId: string
}

export function UnlockButton({ episodeId, cost, seriesId }: UnlockButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleUnlock() {
    setLoading(true)

    try {
      const res = await fetch("/api/episode/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      })

      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || t("episode.unlockFailed"))
      }
    } catch (error) {
      alert(t("episode.unlockFailedRetry"))
    } finally {
      setLoading(false)
    }
  }

  return (
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
          {t("episode.unlockCost", { cost })}
        </>
      )}
    </Button>
  )
}
