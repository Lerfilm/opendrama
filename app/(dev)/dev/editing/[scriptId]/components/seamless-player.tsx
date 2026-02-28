"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { VideoSegment } from "../lib/editing-helpers"

/**
 * Dual-buffer seamless video player.
 * Two <video> elements overlap. While one plays, the other preloads the next
 * segment. On ended, we instantly swap for 0ms gap playback.
 */
export function SeamlessPlayer({
  segments,
  currentIdx,
  isPlaying,
  videoVolume = 1,
  onSegmentChange,
  onEnded,
  onTimeUpdate,
}: {
  segments: VideoSegment[]
  currentIdx: number
  isPlaying: boolean
  videoVolume?: number
  onSegmentChange: (idx: number) => void
  onEnded: () => void
  onTimeUpdate: (currentTime: number, duration: number) => void
}) {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  const activeBufferRef = useRef<"A" | "B">("A")
  const [activeBuffer, setActiveBuffer] = useState<"A" | "B">("A")
  const bufferUrlA = useRef<string | null>(null)
  const bufferUrlB = useRef<string | null>(null)
  const preloadedIdx = useRef<number>(-1)
  const prevIdxRef = useRef<number>(-1)

  const getActiveRef = useCallback(() =>
    activeBufferRef.current === "A" ? videoARef : videoBRef
  , [])
  const getInactiveRef = useCallback(() =>
    activeBufferRef.current === "A" ? videoBRef : videoARef
  , [])
  const getActiveUrl = useCallback(() =>
    activeBufferRef.current === "A" ? bufferUrlA : bufferUrlB
  , [])
  const getInactiveUrl = useCallback(() =>
    activeBufferRef.current === "A" ? bufferUrlB : bufferUrlA
  , [])

  const loadIntoBuffer = useCallback((
    ref: React.RefObject<HTMLVideoElement | null>,
    urlRef: React.MutableRefObject<string | null>,
    url: string,
    autoplay: boolean
  ) => {
    if (!ref.current) return
    if (urlRef.current === url) {
      if (autoplay) ref.current.play().catch(() => {})
      return
    }
    urlRef.current = url
    ref.current.src = url
    if (autoplay) {
      ref.current.load()
      ref.current.play().catch(() => {})
    } else {
      ref.current.preload = "auto"
      ref.current.load()
    }
  }, [])

  useEffect(() => {
    if (currentIdx < 0 || currentIdx >= segments.length) return
    const seg = segments[currentIdx]
    if (!seg?.videoUrl) return

    if (preloadedIdx.current === currentIdx && prevIdxRef.current !== currentIdx) {
      const nextBuf = activeBufferRef.current === "A" ? "B" : "A"
      activeBufferRef.current = nextBuf
      setActiveBuffer(nextBuf)
      const ref = nextBuf === "A" ? videoARef : videoBRef
      if (isPlaying) ref.current?.play().catch(() => {})
    } else {
      loadIntoBuffer(getActiveRef(), getActiveUrl(), seg.videoUrl, isPlaying)
    }

    prevIdxRef.current = currentIdx

    const nextIdx = currentIdx + 1
    if (nextIdx < segments.length && segments[nextIdx]?.videoUrl) {
      preloadedIdx.current = nextIdx
      loadIntoBuffer(getInactiveRef(), getInactiveUrl(), segments[nextIdx].videoUrl!, false)
    } else {
      preloadedIdx.current = -1
    }
  }, [currentIdx, segments, isPlaying, loadIntoBuffer, getActiveRef, getInactiveRef, getActiveUrl, getInactiveUrl])

  useEffect(() => {
    if (videoARef.current) videoARef.current.volume = videoVolume
    if (videoBRef.current) videoBRef.current.volume = videoVolume
  }, [videoVolume])

  const handleVideoEnded = useCallback(() => {
    const nextIdx = currentIdx + 1
    if (nextIdx >= segments.length) {
      onEnded()
      return
    }
    onSegmentChange(nextIdx)
  }, [currentIdx, segments.length, onEnded, onSegmentChange])

  const handleTimeUpdate = useCallback(() => {
    const ref = activeBufferRef.current === "A" ? videoARef : videoBRef
    if (ref.current) {
      onTimeUpdate(ref.current.currentTime, ref.current.duration || 0)
    }
  }, [onTimeUpdate])

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoARef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          zIndex: activeBuffer === "A" ? 2 : 1,
          opacity: activeBuffer === "A" ? 1 : 0,
          pointerEvents: activeBuffer === "A" ? "auto" : "none",
        }}
        controls={activeBuffer === "A"}
        playsInline
        onEnded={activeBuffer === "A" ? handleVideoEnded : undefined}
        onTimeUpdate={activeBuffer === "A" ? handleTimeUpdate : undefined}
      />
      <video
        ref={videoBRef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          zIndex: activeBuffer === "B" ? 2 : 1,
          opacity: activeBuffer === "B" ? 1 : 0,
          pointerEvents: activeBuffer === "B" ? "auto" : "none",
        }}
        controls={activeBuffer === "B"}
        playsInline
        onEnded={activeBuffer === "B" ? handleVideoEnded : undefined}
        onTimeUpdate={activeBuffer === "B" ? handleTimeUpdate : undefined}
      />
    </div>
  )
}
