import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Coins } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default async function HomePage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  // 从数据库读取剧集
  const seriesList = await prisma.series.findMany({
    where: { status: "active" },
    select: {
      id: true,
      title: true,
      coverUrl: true,
      status: true,
      episodes: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  const seriesWithCount = seriesList.map((s) => ({
    ...s,
    episodeCount: s.episodes.length,
  }))

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
      <Link href="/recharge">
        <div className="relative aspect-[16/9] bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow">
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">金币充值</h2>
              <p className="text-sm mb-4">解锁更多精彩剧集</p>
              <Button variant="secondary" size="sm">
                立即充值
              </Button>
            </div>
          </div>
        </div>
      </Link>

      {/* 热门推荐 */}
      <div>
        <h2 className="text-lg font-semibold mb-3">热门推荐</h2>
        {seriesWithCount.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>暂无剧集，敬请期待</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {seriesWithCount.map((series) => (
              <Link key={series.id} href={`/series/${series.id}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader className="p-0">
                    <div className="relative aspect-[2/3] bg-muted">
                      {series.coverUrl ? (
                        <Image
                          src={series.coverUrl}
                          alt={series.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          暂无封面
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="text-xs">
                          {series.status === "active" ? "连载中" : "已完结"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <h3 className="font-medium text-sm line-clamp-2 mb-1">
                      {series.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {series.episodeCount} 集
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
        )}
      </div>
    </div>
  )
}
