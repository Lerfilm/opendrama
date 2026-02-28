"use client"

import { useRef, useCallback } from "react"

interface UseSwipeOptions {
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  /** Minimum distance in px to trigger swipe (default 50) */
  threshold?: number
  /** Whether swiping is enabled */
  enabled?: boolean
}

interface SwipeState {
  startY: number
  startX: number
  deltaY: number
  isSwiping: boolean
}

export function useSwipe({
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  enabled = true,
}: UseSwipeOptions) {
  const stateRef = useRef<SwipeState>({
    startY: 0,
    startX: 0,
    deltaY: 0,
    isSwiping: false,
  })

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return
      const touch = e.touches[0]
      stateRef.current = {
        startY: touch.clientY,
        startX: touch.clientX,
        deltaY: 0,
        isSwiping: false,
      }
    },
    [enabled]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return
      const touch = e.touches[0]
      const state = stateRef.current
      const deltaY = touch.clientY - state.startY
      const deltaX = touch.clientX - state.startX

      // Only register as vertical swipe if deltaY > deltaX (prevents horizontal scroll conflict)
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
        state.isSwiping = true
        state.deltaY = deltaY
      }
    },
    [enabled]
  )

  const onTouchEnd = useCallback(() => {
    if (!enabled) return
    const state = stateRef.current

    if (state.isSwiping) {
      if (state.deltaY < -threshold && onSwipeUp) {
        onSwipeUp()
      } else if (state.deltaY > threshold && onSwipeDown) {
        onSwipeDown()
      }
    }

    // Reset state
    stateRef.current = {
      startY: 0,
      startX: 0,
      deltaY: 0,
      isSwiping: false,
    }
  }, [enabled, threshold, onSwipeUp, onSwipeDown])

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    /** Current vertical swipe offset in px (for animation) */
    getDeltaY: () => stateRef.current.deltaY,
    isSwiping: () => stateRef.current.isSwiping,
  }
}
