export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Coins, Calendar } from "@/components/icons"
import { createT, getLocaleAsync } from "@/lib/i18n"

export default async function PurchasesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }
  const t = createT(await getLocaleAsync())

  const purchases = await prisma.purchase.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  })

  const userBalance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id },
  })
  const availableBalance = Math.max(0, (userBalance?.balance ?? 0) - (userBalance?.reserved ?? 0))

  return (
    <div className="p-4 pb-20">
      <div className="max-w-screen-sm mx-auto space-y-6">
        <Card className="bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0">
          <CardContent className="p-6">
            <p className="text-sm opacity-90 mb-2">{t("purchases.currentBalance")}</p>
            <div className="flex items-center gap-2">
              <Coins className="w-8 h-8" />
              <span className="text-4xl font-bold">{availableBalance}</span>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-bold mb-4">{t("purchases.title")}</h2>
          {purchases.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Coins className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t("purchases.noPurchases")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {purchases.map((purchase) => (
                <Card key={purchase.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            purchase.status === "completed"
                              ? "bg-green-100 text-green-600"
                              : purchase.status === "pending"
                              ? "bg-yellow-100 text-yellow-600"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          <Coins className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">
                              {t("purchases.rechargeCoins", { coins: purchase.coins })}
                            </h3>
                            <Badge
                              variant={
                                purchase.status === "completed"
                                  ? "default"
                                  : purchase.status === "pending"
                                  ? "secondary"
                                  : "destructive"
                              }
                            >
                              {purchase.status === "completed"
                                ? t("purchases.success")
                                : purchase.status === "pending"
                                ? t("purchases.pending")
                                : t("purchases.failed")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {new Date(purchase.createdAt).toLocaleString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">
                          ${(purchase.amount / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
