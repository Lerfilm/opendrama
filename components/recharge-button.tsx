"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "@/components/icons"
import { t } from "@/lib/i18n"

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
        window.location.href = data.url
      } else {
        alert(t("recharge.failed"))
        setLoading(false)
      }
    } catch (error) {
      alert(t("recharge.failed"))
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleRecharge} disabled={loading} size="lg">
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {t("common.processing")}
        </>
      ) : (
        t("recharge.now")
      )}
    </Button>
  )
}
