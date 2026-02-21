"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Star, StarFilled } from "@/components/icons"
import { t } from "@/lib/i18n"

interface StarRatingProps {
  seriesId: string
  initialAvgRating: number
  initialTotalRatings: number
  initialUserRating: number | null
  isLoggedIn: boolean
}

export default function StarRating({
  seriesId,
  initialAvgRating,
  initialTotalRatings,
  initialUserRating,
  isLoggedIn,
}: StarRatingProps) {
  const router = useRouter()
  const [avgRating, setAvgRating] = useState(initialAvgRating)
  const [totalRatings, setTotalRatings] = useState(initialTotalRatings)
  const [userRating, setUserRating] = useState(initialUserRating)
  const [hoverRating, setHoverRating] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleRate = async (rating: number) => {
    if (!isLoggedIn) {
      router.push("/auth/signin")
      return
    }

    if (isSubmitting) return
    setIsSubmitting(true)
    setUserRating(rating)

    try {
      const res = await fetch(`/api/series/${seriesId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      })
      const data = await res.json()
      if (res.ok) {
        setAvgRating(data.averageRating)
        setTotalRatings(data.totalRatings)
        setUserRating(data.userRating)
      }
    } catch {
      setUserRating(initialUserRating)
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayRating = hoverRating || userRating || 0

  return (
    <div className="flex flex-col items-center gap-2 py-3">
      {/* Average rating display */}
      <div className="flex items-center gap-2">
        <StarFilled className="w-5 h-5 text-yellow-400" />
        <span className="text-lg font-bold">{avgRating > 0 ? avgRating.toFixed(1) : "—"}</span>
        <span className="text-sm text-muted-foreground">
          {t("review.ratings", { count: totalRatings })}
        </span>
      </div>

      {/* Interactive rating stars */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-2">
          {isLoggedIn
            ? (userRating ? t("review.yourRating") : t("review.rateThis"))
            : t("review.loginToRate")}
        </span>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onMouseEnter={() => isLoggedIn && setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => handleRate(star)}
            disabled={isSubmitting || !isLoggedIn}
            className="p-0.5 transition-transform hover:scale-110 disabled:cursor-default"
          >
            {star <= displayRating ? (
              <StarFilled className="w-6 h-6 text-yellow-400" />
            ) : (
              <Star className="w-6 h-6 text-muted-foreground/40" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
