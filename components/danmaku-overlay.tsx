"use client"

import { useState, useEffect, useRef, useCallback } from "react"

type DanmakuItem = {
  id: string
  content: string
  timestamp: number
  color: string
  user?: { name: string | null }
}

type ActiveDanmaku = DanmakuItem & {
  lane: number
  startTime: number
  key: string
}

const LANE_COUNT = 3
const DISPLAY_DURATION = 8000 // 8 seconds to cross screen

export default function DanmakuOverlay({
  episodeId,
  currentTime,
  enabled = true,
}: {
  episodeId: string
  currentTime: number
  enabled: boolean
}) {
  const [allDanmakus, setAllDanmakus] = useState<DanmakuItem[]>([])
  const [activeDanmakus, setActiveDanmakus] = useState<ActiveDanmaku[]>([])
  const shownIdsRef = useRef<Set<string>>(new Set())
  const laneTimersRef = useRef<number[]>(new Array(LANE_COUNT).fill(0))

  // Fetch danmakus for this episode
  useEffect(() => {
    if (!episodeId) return
    fetch(`/api/danmaku?episodeId=${episodeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.danmakus) setAllDanmakus(data.danmakus)
      })
      .catch(() => {})
  }, [episodeId])

  // Check for new danmakus to activate based on currentTime
  const checkAndActivate = useCallback(() => {
    if (!enabled) return

    const now = Date.now()
    const windowStart = currentTime - 0.5
    const windowEnd = currentTime + 0.5

    const newActive: ActiveDanmaku[] = []

    for (const d of allDanmakus) {
      if (shownIdsRef.current.has(d.id)) continue
      if (d.timestamp >= windowStart && d.timestamp <= windowEnd) {
        // Find available lane
        let bestLane = 0
        let earliestFree = laneTimersRef.current[0]
        for (let i = 1; i < LANE_COUNT; i++) {
          if (laneTimersRef.current[i] < earliestFree) {
            earliestFree = laneTimersRef.current[i]
            bestLane = i
          }
        }

        laneTimersRef.current[bestLane] = now + 2000 // Stagger 2s per lane

        shownIdsRef.current.add(d.id)
        newActive.push({
          ...d,
          lane: bestLane,
          startTime: now,
          key: `${d.id}-${now}`,
        })
      }
    }

    if (newActive.length > 0) {
      setActiveDanmakus((prev) => [...prev, ...newActive])
    }

    // Clean up expired danmakus
    setActiveDanmakus((prev) =>
      prev.filter((d) => now - d.startTime < DISPLAY_DURATION)
    )
  }, [currentTime, allDanmakus, enabled])

  useEffect(() => {
    checkAndActivate()
  }, [checkAndActivate])

  // Reset when episode changes
  useEffect(() => {
    shownIdsRef.current.clear()
    setActiveDanmakus([])
    laneTimersRef.current = new Array(LANE_COUNT).fill(0)
  }, [episodeId])

  if (!enabled) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {activeDanmakus.map((d) => {
        const elapsed = Date.now() - d.startTime
        const progress = Math.min(elapsed / DISPLAY_DURATION, 1)
        const topPercent = 8 + d.lane * 18 // 8%, 26%, 44%

        return (
          <div
            key={d.key}
            className="absolute whitespace-nowrap text-sm font-medium danmaku-text"
            style={{
              top: `${topPercent}%`,
              right: `${-100 + progress * 200}%`,
              color: d.color,
              textShadow: "1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)",
              animation: `danmaku-scroll ${DISPLAY_DURATION}ms linear`,
              willChange: "transform",
            }}
          >
            {d.content}
          </div>
        )
      })}

      <style jsx>{`
        @keyframes danmaku-scroll {
          from { transform: translateX(100vw); }
          to { transform: translateX(-100%); }
        }
        .danmaku-text {
          animation-fill-mode: forwards;
          right: auto;
          left: 0;
          transform: translateX(100vw);
        }
      `}</style>
    </div>
  )
}

// Add a danmaku to the live set (for optimistic updates after sending)
export function addLocalDanmaku(
  episodeId: string,
  content: string,
  timestamp: number,
  color: string = "#FFFFFF"
): DanmakuItem {
  return {
    id: `local-${Date.now()}`,
    content,
    timestamp,
    color,
  }
}
