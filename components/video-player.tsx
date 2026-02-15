"use client"

import { useEffect, useRef, useState } from "react"
import MuxPlayer from "@mux/mux-player-react"

interface VideoPlayerProps {
  playbackId: string
  episodeId: string
  userId: string
  title: string
}

export function VideoPlayer({
  playbackId,
  episodeId,
  userId,
  title,
}: VideoPlayerProps) {
  const playerRef = useRef<HTMLVideoElement>(null)
  const [lastPosition, setLastPosition] = useState(0)

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

  // 保存观看事件
  async function saveWatchEvent(position: number, duration: number) {
    try {
      await fetch("/api/watch/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId,
          watchPosition: position,
          watchDuration: position - lastPosition,
          completedRate: duration > 0 ? position / duration : 0,
        }),
      })
      setLastPosition(position)
    } catch (error) {
      console.error("Failed to save watch event:", error)
    }
  }

  return (
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
  )
}
