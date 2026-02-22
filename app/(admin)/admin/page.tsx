export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Film, Users, Coins, Sparkles } from "@/components/icons"
import { t } from "@/lib/i18n"
import Link from "next/link"

export default async function AdminDashboardPage() {
  const stats = await Promise.all([
    prisma.series.count(),
    prisma.episode.count(),
    prisma.user.count(),
    prisma.purchase.aggregate({
      where: { status: "completed" },
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
      value: `$${(totalRevenue / 100).toFixed(2)}`,
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

  const quickActions = [
    { href: "/admin/series/new", label: "Create New Series", desc: "Add a new drama series with episodes", icon: "🎬" },
    { href: "/admin/cards/new", label: "Create New Card", desc: "Add a collectible card to the pool", icon: "🃏" },
    { href: "/admin/analytics", label: "View Analytics", desc: "User growth, revenue trends, funnel", icon: "📊" },
    { href: "/admin/series", label: "Manage Series", desc: "Publish, unpublish, or delete series", icon: "📺" },
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
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.quickActions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="p-4 rounded-lg border hover:bg-accent hover:border-primary transition-colors cursor-pointer h-full">
                  <div className="text-2xl mb-2">{action.icon}</div>
                  <p className="text-sm font-medium mb-1">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
