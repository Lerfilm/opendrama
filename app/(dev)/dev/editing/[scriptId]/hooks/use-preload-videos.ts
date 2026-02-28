"use client"

import { useState, useEffect, useRef } from "react"

interface VideoSegment {
  id: string
  status: string
  videoUrl?: string | null
}

interface PreloadProgress {
  total: number
  loaded: number
  percent: number
  isLoading: boolean
}

/**
 * Async preload all done video segments via <link rel="preload"> or fetch.
 * Limits concurrency to MAX_CONCURRENT to avoid overwhelming the browser.
 */
const MAX_CONCURRENT = 3

export function usePreloadVideos(segments: VideoSegment[]): PreloadProgress {
  const [loaded, setLoaded] = useState(0)
  const [total, setTotal] = useState(0)
  const preloadedRef = useRef<Set<string>>(new Set())
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Filter to done segments with videoUrl that haven't been preloaded yet
    const toPreload = segments.filter(
      s => s.status === "done" && s.videoUrl && !preloadedRef.current.has(s.id)
    )

    if (toPreload.length === 0) {
      setTotal(prev => prev || 0)
      return
    }

    setTotal(prev => prev + toPreload.length)
    const controller = new AbortController()
    abortRef.current = controller

    let active = 0
    let queue = [...toPreload]
    let localLoaded = 0

    function processNext() {
      if (controller.signal.aborted) return
      if (queue.length === 0) return

      while (active < MAX_CONCURRENT && queue.length > 0) {
        const seg = queue.shift()!
        active++
        preloadOne(seg)
      }
    }

    function preloadOne(seg: VideoSegment) {
      if (!seg.videoUrl) {
        onComplete(seg)
        return
      }

      // Use fetch with range request to preload the first chunk
      // This is more reliable than <link preload> for video files
      fetch(seg.videoUrl, {
        signal: controller.signal,
        headers: { Range: "bytes=0-524287" }, // First 512KB
      })
        .then(() => onComplete(seg))
        .catch(() => onComplete(seg)) // Count as loaded even on error
    }

    function onComplete(seg: VideoSegment) {
      preloadedRef.current.add(seg.id)
      localLoaded++
      active--
      setLoaded(prev => prev + 1)
      processNext()
    }

    processNext()

    return () => {
      controller.abort()
    }
  }, [segments])

  const percent = total > 0 ? Math.round((loaded / total) * 100) : 100
  const isLoading = total > 0 && loaded < total

  return { total, loaded, percent, isLoading }
}
