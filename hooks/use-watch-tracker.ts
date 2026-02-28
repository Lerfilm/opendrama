"use client"

import { useEffect, useRef, useState, useCallback } from "react"

interface DroppedCard {
  id: string
  name: string
  rarity: string
  imageUrl: string
  quantity: number
}

interface UseWatchTrackerOptions {
  episodeId: string
  userId: string
  /** Get current playback time in seconds */
  getCurrentTime: () => number
  /** Get total duration in seconds */
  getDuration: () => number
  /** Whether the player is currently paused */
  isPaused: () => boolean
  /** Interval in ms for saving progress (default 10000) */
  saveInterval?: number
}

export function useWatchTracker({
  episodeId,
  userId,
  getCurrentTime,
  getDuration,
  isPaused,
  saveInterval = 10000,
}: UseWatchTrackerOptions) {
  const lastPositionRef = useRef(0)
  const [droppedCard, setDroppedCard] = useState<DroppedCard | null>(null)
  const [showCardModal, setShowCardModal] = useState(false)
  const cardDroppedRef = useRef(false)

  // Reset card drop state when episode changes
  useEffect(() => {
    cardDroppedRef.current = false
    setDroppedCard(null)
    setShowCardModal(false)
    lastPositionRef.current = 0
  }, [episodeId])

  // Load last watch position
  const loadPosition = useCallback(async (): Promise<number> => {
    try {
      const res = await fetch(`/api/watch/position?episodeId=${episodeId}`)
      if (res.ok) {
        const data = await res.json()
        return data.position || 0
      }
    } catch (error) {
      console.error("Failed to load watch position:", error)
    }
    return 0
  }, [episodeId])

  // Save watch event + check card drop
  const saveWatchEvent = useCallback(
    async (position: number, duration: number) => {
      try {
        const completedRate = duration > 0 ? position / duration : 0

        await fetch("/api/watch/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeId,
            watchPosition: position,
            watchDuration: position - lastPositionRef.current,
            completedRate,
          }),
        })

        // Check card drop (watch completion rate > 80%)
        if (completedRate > 0.8 && !cardDroppedRef.current) {
          cardDroppedRef.current = true
          const dropRes = await fetch("/api/cards/drop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ episodeId, completedRate }),
          })

          if (dropRes.ok) {
            const data = await dropRes.json()
            if (data.dropped && data.card) {
              setDroppedCard(data.card)
              setShowCardModal(true)
            }
          }
        }

        lastPositionRef.current = position
      } catch (error) {
        console.error("Failed to save watch event:", error)
      }
    },
    [episodeId]
  )

  // Auto-save progress on interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPaused()) {
        const currentTime = Math.floor(getCurrentTime())
        const duration = Math.floor(getDuration())
        if (currentTime > 0 && duration > 0) {
          saveWatchEvent(currentTime, duration)
        }
      }
    }, saveInterval)

    return () => clearInterval(interval)
  }, [episodeId, userId, getCurrentTime, getDuration, isPaused, saveInterval, saveWatchEvent])

  return {
    droppedCard,
    showCardModal,
    setShowCardModal,
    loadPosition,
    saveWatchEvent,
  }
}
