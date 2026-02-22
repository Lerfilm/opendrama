export const dynamic = "force-dynamic"
import { auth, signOut } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Coins, CreditCard, History, Star, Settings, Play, PenTool, Video } from "@/components/icons"
import { t } from "@/lib/i18n"
import prisma from "@/lib/prisma"

export default async function ProfilePage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  // 获取用户统计
  const userId = session.user.id as string
  const [watchCount, scriptCount, cardCount, userBalance] = await Promise.all([
    prisma.watchEvent.count({
      where: { userId },
    }),
    prisma.script.count({
      where: { userId },
    }),
    prisma.userCard.count({
      where: { userId },
    }),
    prisma.userBalance.findUnique({
      where: { userId },
      select: { balance: true, reserved: true },
    }),
  ])
  const availableCoins = userBalance ? userBalance.balance - userBalance.reserved : 0

  const menuItems = [
    { icon: Play, label: t("history.title"), href: "/history", badge: watchCount > 0 ? `${watchCount}` : null },
    { icon: CreditCard, label: t("profile.rechargeCoins"), href: "/recharge" },
    { icon: History, label: t("profile.purchaseHistory"), href: "/purchases" },
    { icon: Star, label: t("profile.cardCollection"), href: "/cards", badge: cardCount > 0 ? `${cardCount}` : null },
    { icon: PenTool, label: t("studio.myScripts"), href: "/studio", badge: scriptCount > 0 ? `${scriptCount}` : null },
    { icon: Settings, label: t("profile.settings"), href: "/settings" },
  ]

  return (
    <div className="p-4 space-y-6">
      {/* 用户卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <img
              src={session.user?.image || "https://via.placeholder.com/80"}
              alt={session.user?.name || "User"}
              className="w-16 h-16 rounded-full border-2 border-primary/20"
            />
            <div className="flex-1">
              <CardTitle className="text-xl">{session.user?.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {session.user?.email}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 金币余额 */}
          <Link href="/recharge">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-lg cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6 text-amber-600" />
                <span className="font-semibold">{t("profile.coinBalance")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-amber-600">
                  {availableCoins}
                </span>
                <span className="text-xs text-amber-500">{t("home.rechargeNow")} →</span>
              </div>
            </div>
          </Link>

          {/* VIP 入口 */}
          <Link href="/subscribe">
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-lg cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-purple-500" />
                <span className="font-medium text-sm">{t("subscribe.title")}</span>
              </div>
              <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs">
                {t("subscribe.join")} →
              </Badge>
            </div>
          </Link>
        </CardContent>
      </Card>

      {/* 统计数据 */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center p-3">
          <p className="text-2xl font-bold">{watchCount}</p>
          <p className="text-xs text-muted-foreground">{t("history.title")}</p>
        </Card>
        <Card className="text-center p-3">
          <p className="text-2xl font-bold">{scriptCount}</p>
          <p className="text-xs text-muted-foreground">{t("studio.myScripts")}</p>
        </Card>
        <Card className="text-center p-3">
          <p className="text-2xl font-bold">{cardCount}</p>
          <p className="text-xs text-muted-foreground">{t("profile.cardCollection")}</p>
        </Card>
      </div>

      {/* 菜单列表 */}
      <Card>
        <CardContent className="p-0">
          {menuItems.map(({ icon: Icon, label, href, badge }, index) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between p-4 hover:bg-accent transition-colors ${
                index < menuItems.length - 1 ? "border-b" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                {badge && (
                  <Badge variant="secondary" className="text-xs">
                    {badge}
                  </Badge>
                )}
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <form
        action={async () => {
          "use server"
          await signOut({ redirectTo: "/auth/signin" })
        }}
      >
        <Button variant="outline" className="w-full text-destructive" type="submit">
          {t("profile.logout")}
        </Button>
      </form>
    </div>
  )
}
