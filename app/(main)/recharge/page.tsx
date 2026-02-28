export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RechargeButton } from "@/components/recharge-button"
import { COIN_PACKAGES } from "@/lib/stripe"
import { Coins, Sparkles, Zap, Crown } from "@/components/icons"
import { createT, getLocaleAsync } from "@/lib/i18n"

export default async function RechargePage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }
  const t = createT(await getLocaleAsync())

  const userBalance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id },
    select: { balance: true, reserved: true, firstChargeBonusUsed: true },
  })
  const availableCoins = userBalance ? userBalance.balance - userBalance.reserved : 0
  const showFirstChargeBonus = !userBalance?.firstChargeBonusUsed

  const icons = [Coins, Sparkles, Zap, Crown]

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-4 pb-20">
      <div className="max-w-screen-sm mx-auto space-y-6">
        {/* First Charge Bonus Banner */}
        {showFirstChargeBonus && (
          <div className="relative bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-4 overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-lg">🎁</span>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">{t("recharge.firstChargeBonus")}</h3>
                <p className="text-white/70 text-xs">{t("recharge.firstChargeBonusDesc")}</p>
              </div>
              <Badge className="ml-auto bg-white/20 text-white border-none shrink-0 text-xs">2x</Badge>
            </div>
          </div>
        )}

        <Card className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">{t("recharge.balance")}</p>
                <div className="flex items-center gap-2">
                  <Coins className="w-8 h-8" />
                  <span className="text-4xl font-bold">
                    {availableCoins}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs opacity-75">{t("recharge.coinPerEpisode")}</p>
                <p className="text-xs opacity-75 mt-1">{t("recharge.canWatch")}</p>
                <p className="text-2xl font-bold">{t("home.episodeCount", { count: availableCoins })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-bold mb-4 px-2">{t("recharge.selectPackage")}</h2>
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
                        {t("recharge.mostPopular")}
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div
                          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0 ${
                            index === 0
                              ? "bg-blue-100 text-blue-600"
                              : index === 1
                              ? "bg-green-100 text-green-600"
                              : index === 2
                              ? "bg-purple-100 text-purple-600"
                              : "bg-orange-100 text-orange-600"
                          }`}
                        >
                          <Icon className="w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold mb-1">
                            {pkg.name}
                          </h3>
                          <p className="text-2xl font-bold text-primary mb-1">
                            {t("recharge.coinsAmount", { coins: pkg.coins })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t("recharge.canWatchEpisodes", { coins: pkg.coins })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold mb-2">
                          ${(pkg.price / 100).toFixed(2)}
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

        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {t("recharge.info")}
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• {t("recharge.info1")}</li>
              <li>• {t("recharge.info2")}</li>
              <li>• {t("recharge.info3")}</li>
              <li>• {t("recharge.info4")}</li>
              <li>• {t("recharge.pricingNote")}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
