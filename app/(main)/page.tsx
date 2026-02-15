import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Coins } from "lucide-react"
import Link from "next/link"

export default async function HomePage() {
  const session = await auth()

  if (!session) {
    redirect("/auth/signin")
  }

  // 模拟数据，Day 2 会从数据库读取
  const mockSeries = [
    {
      id: "1",
      title: "霸道总裁的替身新娘",
      coverUrl: "https://picsum.photos/seed/drama1/400/600",
      episodes: 80,
      category: "都市",
    },
    {
      id: "2",
      title: "重生之豪门千金归来",
      coverUrl: "https://picsum.photos/seed/drama2/400/600",
      episodes: 100,
      category: "重生",
    },
    {
      id: "3",
      title: "隐婚老公是大佬",
      coverUrl: "https://picsum.photos/seed/drama3/400/600",
      episodes: 60,
      category: "甜宠",
    },
    {
      id: "4",
      title: "穿越之王妃要出墙",
      coverUrl: "https://picsum.photos/seed/drama4/400/600",
      episodes: 90,
      category: "古装",
    },
  ]

  return (
    <div className="space-y-6 p-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DramaBox</h1>
          <p className="text-sm text-muted-foreground">你好，{session.user?.name}</p>
        </div>
        <div className="flex items-center gap-2 bg-primary/10 rounded-full px-4 py-2">
          <Coins className="w-5 h-5 text-primary" />
          <span className="font-semibold">{(session.user as any)?.coins || 0}</span>
        </div>
      </div>

      {/* Banner 占位 */}
      <div className="relative aspect-[16/9] bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">新用户福利</h2>
            <p className="text-sm mb-4">注册送 100 金币</p>
            <Button variant="secondary" size="sm">
              立即充值
            </Button>
          </div>
        </div>
      </div>

      {/* 热门推荐 */}
      <div>
        <h2 className="text-lg font-semibold mb-3">热门推荐</h2>
        <div className="grid grid-cols-2 gap-4">
          {mockSeries.map((series) => (
            <Link key={series.id} href={`/series/${series.id}`}>
              <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="p-0">
                  <div className="relative aspect-[2/3]">
                    <img
                      src={series.coverUrl}
                      alt={series.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="text-xs">
                        {series.category}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  <h3 className="font-medium text-sm line-clamp-2 mb-1">
                    {series.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {series.episodes} 集
                  </p>
                </CardContent>
                <CardFooter className="p-3 pt-0">
                  <Button size="sm" className="w-full" variant="outline">
                    <Play className="w-4 h-4 mr-1" />
                    开始观看
                  </Button>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
