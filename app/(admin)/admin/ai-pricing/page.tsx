"use client"

import { useEffect, useState } from "react"

interface AiPrice {
  id: string
  featureKey: string
  label: string
  costCoins: number
  description: string | null
  enabled: boolean
}

export default function AIPricingPage() {
  const [prices, setPrices] = useState<AiPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/ai-pricing")
      .then(r => r.json())
      .then(data => {
        setPrices(data.prices || [])
        setLoading(false)
      })
  }, [])

  async function saveField(featureKey: string, patch: { costCoins?: number; enabled?: boolean }) {
    setSaving(featureKey)
    try {
      const res = await fetch("/api/admin/ai-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKey, ...patch }),
      })
      if (res.ok) {
        const { price } = await res.json()
        setPrices(prev => prev.map(p => p.featureKey === featureKey ? { ...p, ...price } : p))
      }
    } finally {
      setSaving(null)
      setEditing(prev => { const n = { ...prev }; delete n[featureKey]; return n })
    }
  }

  function handleCostBlur(featureKey: string) {
    const raw = editing[featureKey]
    if (raw === undefined) return
    const val = parseInt(raw, 10)
    if (!isNaN(val) && val >= 0) {
      saveField(featureKey, { costCoins: val })
    } else {
      setEditing(prev => { const n = { ...prev }; delete n[featureKey]; return n })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Loading pricing...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">AI Feature Pricing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set the coin cost for each AI feature. Users are charged when they confirm. Set to 0 for free.
        </p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-[200px]">Feature</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-24">Cost 🪙</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-20">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((price, i) => (
              <tr key={price.featureKey} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                <td className="px-4 py-3">
                  <div className="font-medium">{price.label}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{price.featureKey}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[12px]">
                  {price.description || "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={editing[price.featureKey] ?? price.costCoins}
                    onChange={e => setEditing(prev => ({ ...prev, [price.featureKey]: e.target.value }))}
                    onBlur={() => handleCostBlur(price.featureKey)}
                    onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-16 text-center h-7 px-1 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    style={{ background: saving === price.featureKey ? "#F0F9FF" : undefined }}
                  />
                  {saving === price.featureKey && (
                    <span className="ml-1 text-[10px] text-muted-foreground">saving...</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => saveField(price.featureKey, { enabled: !price.enabled })}
                    disabled={saving === price.featureKey}
                    className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50"
                    style={{ background: price.enabled ? "#4F46E5" : "#D1D5DB" }}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: price.enabled ? "translateX(18px)" : "translateX(2px)" }}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground mt-4">
        Click the coins field and press Enter (or click away) to save. Toggle the switch to enable/disable a feature.
        Disabled features will return an error when called.
      </p>
    </div>
  )
}
