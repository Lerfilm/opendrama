import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RechargeButton } from "@/components/recharge-button"
import { COIN_PACKAGES } from "@/lib/stripe"
import { Coins, Sparkles, Zap, Crown } from "lucide-react"

export default async function RechargePage() {
  const session = await auth()

  if (!session) {
    redirect("/auth/signin")
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { coins: true },
  })

  const icons = [Coins, Sparkles, Zap, Crown]

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-4 pb-20">
      <div className="max-w-screen-sm mx-auto space-y-6">
        {/* 当前余额卡片 */}
        <Card className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">当前余额</p>
                <div className="flex items-center gap-2">
                  <Coins className="w-8 h-8" />
                  <span className="text-4xl font-bold">
                    {user?.coins || 0}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs opacity-75">1 金币 = 1 集</p>
                <p className="text-xs opacity-75 mt-1">可观看约</p>
                <p className="text-2xl font-bold">{user?.coins || 0} 集</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 充值套餐 */}
        <div>
          <h2 className="text-xl font-bold mb-4 px-2">选择充值套餐</h2>
          <div className="grid grid-cols-1 gap-4">
            {COIN_PACKAGES.map((pkg, index) => {
              const Icon = icons[index]
              return (
                <Card
                  key={pkg.id}
                  className={`relative overflow-hidden hover:shadow-lg transition-shadow ${
                    pkg.popular ? "border-2 border-primary" : ""
                  }`}
                >
                  {pkg.popular && (
                    <div className="absolute top-0 right-0">
                      <Badge className="rounded-none rounded-bl-lg">
                        🔥 最受欢迎
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-16 h-16 rounded-full flex items-center justify-center ${
                            index === 0
                              ? "bg-blue-100 text-blue-600"
                              : index === 1
                              ? "bg-green-100 text-green-600"
                              : index === 2
                              ? "bg-purple-100 text-purple-600"
                              : "bg-orange-100 text-orange-600"
                          }`}
                        >
                          <Icon className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold mb-1">
                            {pkg.name}
                          </h3>
                          <p className="text-2xl font-bold text-primary mb-1">
                            {pkg.coins} 金币
                          </p>
                          <p className="text-sm text-muted-foreground">
                            可观看 {pkg.coins} 集剧集
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold mb-2">
                          ¥{(pkg.price / 100).toFixed(0)}
                        </div>
                        <RechargeButton packageId={pkg.id} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* 说明 */}
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              充值说明
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 1 金币可解锁观看 1 集剧集</li>
              <li>• 第一集永久免费观看</li>
              <li>• 金币永不过期</li>
              <li>• 支持支付宝、微信、银行卡支付</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
