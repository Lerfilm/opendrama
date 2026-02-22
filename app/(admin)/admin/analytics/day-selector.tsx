"use client"

import { useRouter, useSearchParams } from "next/navigation"

const OPTIONS = [7, 30, 90] as const

export function AnalyticsDaySelector({ days }: { days: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function select(d: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("days", String(d))
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "#E0E0E0" }}>
      {OPTIONS.map((d) => (
        <button
          key={d}
          onClick={() => select(d)}
          className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
          style={{
            background: days === d ? "#fff" : "transparent",
            color: days === d ? "#1A1A1A" : "#888",
            boxShadow: days === d ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
          }}
        >
          {d}d
        </button>
      ))}
    </div>
  )
}
