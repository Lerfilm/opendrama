import { auth, signOut } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Coins, CreditCard, History, Star, Settings } from "@/components/icons"
import { t } from "@/lib/i18n"

export default async function ProfilePage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const menuItems = [
    { icon: CreditCard, label: t("profile.rechargeCoins"), href: "/recharge" },
    { icon: History, label: t("profile.purchaseHistory"), href: "/purchases" },
    { icon: Star, label: t("profile.cardCollection"), href: "/cards" },
    { icon: Settings, label: t("profile.settings"), href: "/settings" },
  ]

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <img
              src={session.user?.image || "https://via.placeholder.com/80"}
              alt={session.user?.name || "User"}
              className="w-16 h-16 rounded-full"
            />
            <div>
              <CardTitle className="text-xl">{session.user?.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {session.user?.email}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Coins className="w-6 h-6 text-amber-600" />
              <span className="font-semibold">{t("profile.coinBalance")}</span>
            </div>
            <div className="text-2xl font-bold text-amber-600">
              {(session.user as any)?.coins || 0}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {menuItems.map(({ icon: Icon, label, href }, index) => (
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
        <Button variant="outline" className="w-full" type="submit">
          {t("profile.logout")}
        </Button>
      </form>
    </div>
  )
}
