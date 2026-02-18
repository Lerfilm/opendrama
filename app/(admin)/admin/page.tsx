export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Film, Users, Coins, Sparkles } from "@/components/icons"
import { t } from "@/lib/i18n"

export default async function AdminDashboardPage() {
  const stats = await Promise.all([
    prisma.series.count(),
    prisma.episode.count(),
    prisma.user.count(),
    prisma.purchase.aggregate({
      _sum: { amount: true },
    }),
    prisma.card.count(),
  ])

  const [seriesCount, episodeCount, userCount, revenueData, cardCount] = stats
  const totalRevenue = revenueData._sum.amount || 0

  const statCards = [
    {
      title: t("admin.totalSeries"),
      value: seriesCount,
      icon: Film,
      description: t("home.episodeCount", { count: episodeCount }),
    },
    {
      title: t("admin.totalUsers"),
      value: userCount,
      icon: Users,
      description: t("admin.registeredUsers"),
    },
    {
      title: t("admin.totalRevenue"),
      value: `¥${(totalRevenue / 100).toFixed(2)}`,
      icon: Coins,
      description: t("admin.totalRecharge"),
    },
    {
      title: t("admin.totalCards"),
      value: cardCount,
      icon: Sparkles,
      description: t("admin.createdCards"),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t("admin.dashboard")}</h1>
        <p className="text-muted-foreground">{t("admin.dashboardDesc")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.quickActions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            • {t("admin.quickAction1")}
          </p>
          <p className="text-sm text-muted-foreground">
            • {t("admin.quickAction2")}
          </p>
          <p className="text-sm text-muted-foreground">
            • {t("admin.quickAction3")}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
