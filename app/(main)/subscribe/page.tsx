"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Star } from "@/components/icons"

const PLANS = [
  {
    id: "monthly",
    name: "月卡",
    nameEn: "Monthly Pass",
    price: "$4.99",
    priceNum: 499,
    period: "/ 月",
    periodEn: "/ month",
    features: [
      "每日赠送 5 金币",
      "免费观看标记「会员免费」的剧集",
      "创作中心无限次 AI 剧本生成",
      "文生视频 50% 折扣",
      "专属会员徽章",
    ],
    featuresEn: [
      "5 free coins daily",
      "Free access to \"Members Free\" episodes",
      "Unlimited AI script generation",
      "50% off text-to-video",
      "Exclusive member badge",
    ],
    popular: true,
  },
  {
    id: "yearly",
    name: "年卡",
    nameEn: "Annual Pass",
    price: "$39.99",
    priceNum: 3999,
    period: "/ 年",
    periodEn: "/ year",
    features: [
      "每日赠送 10 金币",
      "免费观看所有剧集",
      "创作中心无限次 AI 功能",
      "文生视频免费",
      "专属年卡徽章 + 限定卡牌",
      "相当于月卡 33% 折扣",
    ],
    featuresEn: [
      "10 free coins daily",
      "Free access to all episodes",
      "Unlimited AI features in studio",
      "Free text-to-video",
      "Annual badge + limited card",
      "33% off compared to monthly",
    ],
    popular: false,
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
        alert(data.error || "Failed to subscribe")
        return
      }

      const { url } = await res.json()
      if (url) {
        window.location.href = url
      }
    } catch {
      alert("订阅失败，请重试")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      {/* 顶部标题 */}
      <div className="text-center pt-4">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-100 to-orange-100 px-4 py-2 rounded-full mb-4">
          <Star className="w-5 h-5 text-amber-600" />
          <span className="font-bold text-amber-800">VIP 会员</span>
        </div>
        <h1 className="text-2xl font-bold">解锁全部特权</h1>
        <p className="text-sm text-muted-foreground mt-1">
          每日金币 · 免费观看 · AI 创作特权
        </p>
      </div>

      {/* 套餐卡片 */}
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
                推荐
              </div>
            )}
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span className="text-lg">{plan.name}</span>
                <div className="text-right">
                  <span className="text-2xl font-bold text-primary">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>{feature}</span>
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
                {loading === plan.id ? "处理中..." : `订阅 ${plan.name}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 金币套餐入口 */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">不想订阅？也可以单次充值</p>
        <Button
          variant="outline"
          onClick={() => router.push("/recharge")}
        >
          金币充值套餐
        </Button>
      </div>

      {/* 说明 */}
      <div className="text-xs text-muted-foreground space-y-1 px-2">
        <p>• 订阅将通过 Stripe 安全支付</p>
        <p>• 月卡/年卡到期后自动续费，可随时取消</p>
        <p>• 每日赠送金币在每日零点（UTC）自动发放</p>
        <p>• 取消订阅后，当前周期内的权益继续有效</p>
      </div>
    </div>
  )
}
