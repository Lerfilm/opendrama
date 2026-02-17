export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Film, Users, Coins, Sparkles } from "lucide-react"

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
      title: "剧集总数",
      value: seriesCount,
      icon: Film,
      description: `${episodeCount} 集`,
    },
    {
      title: "用户总数",
      value: userCount,
      icon: Users,
      description: "注册用户",
    },
    {
      title: "总收入",
      value: `¥${(totalRevenue / 100).toFixed(2)}`,
      icon: Coins,
      description: "累计充值",
    },
    {
      title: "卡牌总数",
      value: cardCount,
      icon: Sparkles,
      description: "已创建卡牌",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">控制台</h1>
        <p className="text-muted-foreground">OpenDrama 后台管理系统</p>
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
          <CardTitle>快速操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            • 剧集管理：创建、编辑、删除剧集和单集
          </p>
          <p className="text-sm text-muted-foreground">
            • 卡牌管理：创建、编辑卡牌信息
          </p>
          <p className="text-sm text-muted-foreground">
            • 视频上传：上传视频到 Mux，获取 PlaybackID
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
