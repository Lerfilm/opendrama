"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Coins, CheckCircle, Sparkles } from "@/components/icons"
import { t } from "@/lib/i18n"

const REWARDS = [2, 3, 4, 5, 6, 8, 10]

export default function DailyCheckIn() {
  const [loading, setLoading] = useState(true)
  const [checkedIn, setCheckedIn] = useState(false)
  const [streak, setStreak] = useState(0)
  const [todayReward, setTodayReward] = useState(0)
  const [claiming, setClaiming] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    fetch("/api/checkin")
      .then((r) => r.json())
      .then((data) => {
        setCheckedIn(data.checkedInToday)
        setStreak(data.currentStreak)
        setTodayReward(data.todayReward)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleCheckIn = async () => {
    if (claiming || checkedIn) return
    setClaiming(true)
    try {
      const res = await fetch("/api/checkin", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setCheckedIn(true)
        setStreak(data.streak)
        setTodayReward(data.reward)
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 3000)
      }
    } catch {
      // ignore
    } finally {
      setClaiming(false)
    }
  }

  if (loading) return null

  return (
    <div className="px-4 md:px-6 mt-4">
      <div className="relative bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
        <div className="absolute bottom-0 left-8 w-12 h-12 bg-white/5 rounded-full translate-y-4" />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <h3 className="text-white font-bold text-sm">{t("checkin.title")}</h3>
            </div>
            {streak > 0 && (
              <span className="text-white/70 text-xs font-medium">
                {t("checkin.streak", { count: streak })}
              </span>
            )}
          </div>

          {/* 7-day reward row */}
          <div className="flex gap-1 mb-3">
            {REWARDS.map((reward, i) => {
              const dayNum = i + 1
              const isCompleted = checkedIn ? i < streak : i < streak
              const isToday = checkedIn
                ? i === streak - 1
                : i === streak
              return (
                <div
                  key={i}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-center ${
                    isCompleted
                      ? "bg-white/20"
                      : isToday
                        ? "bg-white/30 ring-1 ring-white/50"
                        : "bg-white/10"
                  }`}
                >
                  <span className="text-white/60 text-[8px] font-medium">
                    {t("checkin.day", { num: dayNum })}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {isCompleted ? (
                      <CheckCircle className="w-3 h-3 text-green-300" />
                    ) : (
                      <Coins className="w-3 h-3 text-amber-300" />
                    )}
                    <span className={`text-[10px] font-bold ${isCompleted ? "text-green-300" : "text-white"}`}>
                      {reward}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/50 text-[10px]">{t("checkin.todayReward")}</p>
              <p className="text-amber-300 font-bold text-sm">
                {t("checkin.reward", { amount: todayReward })}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleCheckIn}
              disabled={checkedIn || claiming}
              className={`rounded-full px-5 text-xs font-bold ${
                checkedIn
                  ? "bg-white/20 text-white/70 cursor-default hover:bg-white/20"
                  : "bg-white text-indigo-700 hover:bg-white/90 shadow-lg"
              }`}
            >
              {showSuccess ? (
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {t("checkin.success")}
                </span>
              ) : checkedIn ? (
                t("checkin.claimed")
              ) : claiming ? (
                "..."
              ) : (
                t("checkin.button")
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
