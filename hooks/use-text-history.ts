"use client"

import { useCallback, useRef, useState } from "react"

export interface TextHistoryReturn {
  value: string
  setValue: (v: string) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  reset: (v: string) => void
}

/**
 * Undo/redo history for text inputs.
 * Debounces rapid typing into single history snapshots.
 * Fixes React controlled textarea destroying native Cmd+Z.
 */
export function useTextHistory(initial: string, debounceMs = 400): TextHistoryReturn {
  const historyRef = useRef<string[]>([initial])
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [value, setValueState] = useState(initial)
  // Force re-render trigger
  const [, setTick] = useState(0)
  const tick = useCallback(() => setTick(n => n + 1), [])

  const commit = useCallback((val: string) => {
    const hist = historyRef.current
    const idx = indexRef.current
    if (val === hist[idx]) return
    // Truncate any redo history
    historyRef.current = [...hist.slice(0, idx + 1), val]
    indexRef.current = historyRef.current.length - 1
    // Cap at 100
    if (historyRef.current.length > 100) {
      historyRef.current.shift()
      indexRef.current = historyRef.current.length - 1
    }
  }, [])

  const setValue = useCallback((newVal: string) => {
    setValueState(newVal)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      commit(newVal)
      tick()
    }, debounceMs)
  }, [debounceMs, commit, tick])

  const undo = useCallback(() => {
    // Flush pending
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      // Commit current value first so we can undo to previous
      commit(value)
    }
    const newIdx = Math.max(0, indexRef.current - 1)
    indexRef.current = newIdx
    const newVal = historyRef.current[newIdx]
    setValueState(newVal)
    tick()
  }, [value, commit, tick])

  const redo = useCallback(() => {
    const newIdx = Math.min(historyRef.current.length - 1, indexRef.current + 1)
    indexRef.current = newIdx
    const newVal = historyRef.current[newIdx]
    setValueState(newVal)
    tick()
  }, [tick])

  const reset = useCallback((v: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    historyRef.current = [v]
    indexRef.current = 0
    setValueState(v)
    tick()
  }, [tick])

  return {
    value,
    setValue,
    undo,
    redo,
    canUndo: indexRef.current > 0 || (timerRef.current !== null),
    canRedo: indexRef.current < historyRef.current.length - 1,
    reset,
  }
}
