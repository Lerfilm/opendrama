"use client"

import { useState } from "react"

const PACKAGES = [
  { id: "starter",  name: "Starter",  coins: 60,   price: 0.99,  popular: false, color: "#3B82F6" },
  { id: "value",    name: "Value",    coins: 300,  price: 4.99,  popular: true,  color: "#10B981" },
  { id: "premium",  name: "Premium",  coins: 1000, price: 14.99, popular: false, color: "#8B5CF6" },
  { id: "ultimate", name: "Ultimate", coins: 2000, price: 29.99, popular: false, color: "#F59E0B" },
]

interface RechargeModalProps {
  balance: number
  onClose: () => void
}

export function RechargeModal({ balance, onClose }: RechargeModalProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleBuy(packageId: string) {
    setLoadingId(packageId)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      })
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.url
      } else {
        alert("Payment failed. Please try again.")
        setLoadingId(null)
      }
    } catch {
      alert("Network error. Please try again.")
      setLoadingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />

      {/* Panel — drops down from top-right */}
      <div
        className="relative mt-10 mr-2 w-80 rounded-xl shadow-2xl overflow-hidden"
        style={{ background: "#1C1C1E", border: "1px solid #333" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #2A2A2E" }}>
          <div>
            <p className="text-[11px] font-medium" style={{ color: "#888" }}>Current Balance</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "#F59E0B" }}>
                <circle cx="12" cy="12" r="10" fill="#F59E0B" opacity="0.25" />
                <text x="12" y="16" textAnchor="middle" fontSize="11" fill="#F59E0B" fontWeight="bold">¢</text>
              </svg>
              <span className="text-xl font-bold" style={{ color: "#F59E0B" }}>{balance.toLocaleString()}</span>
              <span className="text-[10px]" style={{ color: "#666" }}>coins</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "#2A2A2E", color: "#888" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Packages */}
        <div className="p-3 space-y-2">
          {PACKAGES.map(pkg => (
            <div
              key={pkg.id}
              className="relative flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{
                background: pkg.popular ? "rgba(16,185,129,0.08)" : "#242428",
                border: pkg.popular ? "1px solid rgba(16,185,129,0.35)" : "1px solid #2E2E32",
              }}
            >
              {pkg.popular && (
                <span
                  className="absolute -top-2 left-3 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#10B981", color: "#fff" }}
                >
                  POPULAR
                </span>
              )}

              {/* Left: icon + info */}
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
                  style={{ background: `${pkg.color}22`, color: pkg.color }}
                >
                  {pkg.coins >= 1000 ? "★" : pkg.coins >= 300 ? "◆" : pkg.coins >= 100 ? "▲" : "●"}
                </div>
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: "#E8E8E8" }}>{pkg.name}</p>
                  <p className="text-[11px]" style={{ color: pkg.color }}>{pkg.coins.toLocaleString()} coins</p>
                </div>
              </div>

              {/* Right: price + buy */}
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>
                  ${pkg.price.toFixed(2)}
                </span>
                <button
                  onClick={() => handleBuy(pkg.id)}
                  disabled={loadingId !== null}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: pkg.popular ? "#10B981" : "#4F46E5", color: "#fff" }}
                >
                  {loadingId === pkg.id ? (
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : "Buy"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5" style={{ borderTop: "1px solid #2A2A2E" }}>
          <p className="text-[10px] text-center" style={{ color: "#555" }}>
            Powered by Stripe · Secure payment
          </p>
        </div>
      </div>
    </div>
  )
}
