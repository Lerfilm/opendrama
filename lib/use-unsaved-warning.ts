import { useEffect, useRef, useCallback } from "react"

/**
 * Warns the user before they leave the page (close/reload) if there are unsaved changes.
 * Returns markDirty() and markClean() to call on modifications and saves respectively.
 */
export function useUnsavedWarning() {
  const isDirtyRef = useRef(false)

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [])

  const markDirty = useCallback(() => {
    isDirtyRef.current = true
  }, [])

  const markClean = useCallback(() => {
    isDirtyRef.current = false
  }, [])

  return { markDirty, markClean, isDirtyRef }
}
