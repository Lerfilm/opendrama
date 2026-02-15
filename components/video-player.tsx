"use client"

import { useEffect, useRef, useState } from "react"
import MuxPlayer from "@mux/mux-player-react"
import { CardDropModal } from "./card-drop-modal"

interface VideoPlayerProps {
  playbackId: string
  episodeId: string
  userId: string
  title: string
}

interface DroppedCard {
  id: string
  name: string
  rarity: string
  imageUrl: string
  quantity: number
}

export function VideoPlayer({
  playbackId,
  episodeId,
  userId,
  title,
}: VideoPlayerProps) {
  const playerRef = useRef<HTMLVideoElement>(null)
  const [lastPosition, setLastPosition] = useState(0)
  const [droppedCard, setDroppedCard] = useState<DroppedCard | null>(null)
  const [showCardModal, setShowCardModal] = useState(false)

  // 加载上次观看位置
  useEffect(() => {
    async function loadWatchPosition() {
      try {
        const res = await fetch(`/api/watch/position?episodeId=${episodeId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.position && playerRef.current) {
            playerRef.current.currentTime = data.position
          }
        }
      } catch (error) {
        console.error("Failed to load watch position:", error)
      }
    }

    loadWatchPosition()
  }, [episodeId])

  // 保存观看进度（每 10 秒一次）
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current && !playerRef.current.paused) {
        const currentTime = Math.floor(playerRef.current.currentTime)
        const duration = Math.floor(playerRef.current.duration)

        if (currentTime > 0 && duration > 0) {
          saveWatchEvent(currentTime, duration)
        }
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [episodeId, userId])

  // 保存观看事件 + 检查卡牌掉落
  async function saveWatchEvent(position: number, duration: number) {
    try {
      const completedRate = duration > 0 ? position / duration : 0

      await fetch("/api/watch/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId,
          watchPosition: position,
          watchDuration: position - lastPosition,
          completedRate,
        }),
      })

      // 检查卡牌掉落（观看完成率 > 80%）
      if (completedRate > 0.8 && !droppedCard) {
        const dropRes = await fetch("/api/cards/drop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeId,
            completedRate,
          }),
        })

        if (dropRes.ok) {
          const data = await dropRes.json()
          if (data.dropped && data.card) {
            setDroppedCard(data.card)
            setShowCardModal(true)
          }
        }
      }

      setLastPosition(position)
    } catch (error) {
      console.error("Failed to save watch event:", error)
    }
  }

  return (
    <>
      <div className="w-full h-screen bg-black">
        <MuxPlayer
          ref={playerRef}
          playbackId={playbackId}
          metadata={{
            video_title: title,
            viewer_user_id: userId,
          }}
          streamType="on-demand"
          autoPlay
          style={{
            width: "100%",
            height: "100%",
            maxWidth: "100vw",
            aspectRatio: "9/16",
          }}
        />
      </div>

      {droppedCard && (
        <CardDropModal
          card={droppedCard}
          open={showCardModal}
          onClose={() => setShowCardModal(false)}
        />
      )}
    </>
  )
}
