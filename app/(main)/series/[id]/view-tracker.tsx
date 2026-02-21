"use client"

import { useEffect } from "react"

export default function SeriesViewTracker({ seriesId }: { seriesId: string }) {
  useEffect(() => {
    fetch(`/api/series/${seriesId}/view`, { method: "POST" }).catch(() => {})
  }, [seriesId])

  return null
}
