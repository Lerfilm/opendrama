"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Star } from "@/components/icons"
import { t } from "@/lib/i18n"

const PLANS = [
  {
    id: "monthly",
    nameKey: "subscribe.monthly",
    price: "$99",
    priceNum: 9900,
    periodKey: "subscribe.perMonth",
    featureKeys: [
      "subscribe.feature.dailyCoins200",
      "subscribe.feature.memberFreeEpisodes",
      "subscribe.feature.aiScripts500",
      "subscribe.feature.t2vDiscount",
      "subscribe.feature.memberBadge",
    ],
    popular: false,
  },
  {
    id: "yearly",
    nameKey: "subscribe.yearly",
    price: "$85",
    priceNum: 8500,
    periodKey: "subscribe.perMonth",
    featureKeys: [
      "subscribe.feature.dailyCoins250",
      "subscribe.feature.allEpisodesFree",
      "subscribe.feature.aiScripts1000",
      "subscribe.feature.t2vFree",
      "subscribe.feature.annualBadge",
      "subscribe.feature.yearlyDiscount",
    ],
    popular: true,
  },
]

export default function SubscribePage() {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  const handleSubscribe = async (planId: string) => {
    setLoading(planId)
    try {
      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || t("subscribe.failed"))
        return
      }

      const { url } = await res.json()
      if (url) {
        window.location.href = url
      }
    } catch {
      alert(t("subscribe.failed"))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-100 to-orange-100 px-4 py-2 rounded-full mb-4">
          <Star className="w-5 h-5 text-amber-600" />
          <span className="font-bold text-amber-800">{t("subscribe.title")}</span>
        </div>
        <h1 className="text-2xl font-bold">{t("subscribe.subtitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("subscribe.tagline")}
        </p>
      </div>

      <div className="space-y-4">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={`relative overflow-hidden ${
              plan.popular ? "border-2 border-amber-400 shadow-lg" : ""
            }`}
          >
            {plan.popular && (
              <div className="absolute top-0 right-0 bg-amber-400 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                {t("subscribe.recommended")}
              </div>
            )}
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span className="text-lg">{t(plan.nameKey)}</span>
                <div className="text-right">
                  <span className="text-2xl font-bold text-primary">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(plan.periodKey)}
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.featureKeys.map((key, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
              <Button
                className={`w-full ${
                  plan.popular
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    : ""
                }`}
                size="lg"
                onClick={() => handleSubscribe(plan.id)}
                disabled={loading !== null}
              >
                {loading === plan.id ? t("common.processing") : t("subscribe.subscribeTo", { plan: t(plan.nameKey) })}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">{t("subscribe.preferTopUp")}</p>
        <Button
          variant="outline"
          onClick={() => router.push("/recharge")}
        >
          {t("subscribe.coinPackages")}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground space-y-1 px-2">
        <p>• {t("subscribe.info1")}</p>
        <p>• {t("subscribe.info2")}</p>
        <p>• {t("subscribe.info3")}</p>
        <p>• {t("subscribe.info4")}</p>
      </div>
    </div>
  )
}
