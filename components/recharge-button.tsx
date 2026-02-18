"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "@/components/icons"

interface RechargeButtonProps {
  packageId: string
}

export function RechargeButton({ packageId }: RechargeButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleRecharge() {
    setLoading(true)

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      })

      if (res.ok) {
        const data = await res.json()
        // 跳转到 Stripe Checkout
        window.location.href = data.url
      } else {
        alert("充值失败，请重试")
        setLoading(false)
      }
    } catch (error) {
      alert("充值失败，请重试")
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleRecharge} disabled={loading} size="lg">
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          处理中...
        </>
      ) : (
        "立即充值"
      )}
    </Button>
  )
}
