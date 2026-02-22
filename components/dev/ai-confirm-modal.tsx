"use client"

import { useEffect, useState } from "react"

interface AIConfirmModalProps {
  featureKey: string
  featureLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function AIConfirmModal({ featureKey, featureLabel, onConfirm, onCancel }: AIConfirmModalProps) {
  const [costCoins, setCostCoins] = useState<number | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadInfo() {
      try {
        const [priceRes, balanceRes] = await Promise.all([
          fetch(`/api/ai-pricing?feature=${featureKey}`),
          fetch("/api/tokens/balance"),
        ])
        if (cancelled) return
        if (priceRes.ok) {
          const d = await priceRes.json()
          setCostCoins(d.costCoins ?? 0)
        }
        if (balanceRes.ok) {
          const d = await balanceRes.json()
          setBalance(d.available ?? 0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadInfo()
    return () => { cancelled = true }
  }, [featureKey])

  const canAfford = costCoins !== null && balance !== null && balance >= costCoins

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="w-80 rounded-xl shadow-2xl overflow-hidden"
        style={{ background: "#FAFAFA", border: "1px solid #E0E0E0" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>AI 功能确认</span>
          </div>
          <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{featureLabel}</p>
        </div>

        {/* Cost info */}
        <div className="mx-5 mb-4 rounded-lg px-4 py-3" style={{ background: "#F0F0F0" }}>
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-indigo-400 border-t-transparent animate-spin" />
              <span className="text-xs" style={{ color: "#999" }}>加载价格中...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "#666" }}>本次消耗</span>
                <span className="text-sm font-bold" style={{ color: costCoins === 0 ? "#10B981" : "#4F46E5" }}>
                  {costCoins === 0 ? "免费" : `${costCoins} 🪙`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "#666" }}>当前余额</span>
                <span className="text-sm font-semibold" style={{ color: canAfford ? "#1A1A1A" : "#EF4444" }}>
                  {balance ?? "—"} 🪙
                </span>
              </div>
              {!canAfford && costCoins !== null && costCoins > 0 && (
                <p className="text-[11px] pt-1" style={{ color: "#EF4444" }}>
                  余额不足，还需 {(costCoins - (balance ?? 0))} 🪙，请前往充值
                </p>
              )}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 h-9 rounded-lg text-[12px] font-medium transition-colors"
            style={{ background: "#E8E8E8", color: "#555" }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || (!canAfford && costCoins !== 0)}
            className="flex-1 h-9 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40"
            style={{
              background: canAfford || costCoins === 0 ? "#4F46E5" : "#E0E0E0",
              color: canAfford || costCoins === 0 ? "#fff" : "#AAA",
            }}
          >
            {loading ? "..." : costCoins === 0 ? "确认" : `确认扣除 ${costCoins} 🪙`}
          </button>
        </div>
      </div>
    </div>
  )
}
