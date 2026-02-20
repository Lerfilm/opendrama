export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Users, Play } from "@/components/icons"
import Link from "next/link"
import Image from "next/image"
import { t } from "@/lib/i18n"

export default async function TheaterPage() {
  const session = await auth()

  // 获取公开的活跃剧场
  const theaters = await prisma.theater.findMany({
    where: {
      OR: [
        { status: "live" },
        { status: "paused" },
        { status: "ended", updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
      isPublic: true,
    },
    include: {
      creator: { select: { name: true, image: true } },
      _count: { select: { votes: true, sessions: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 20,
  })

  const statusConfig: Record<string, { label: string; className: string }> = {
    live: { label: t("theater.live"), className: "bg-red-500 text-white animate-pulse" },
    paused: { label: t("theater.paused"), className: "bg-yellow-100 text-yellow-700" },
    ended: { label: t("theater.ended"), className: "bg-gray-100 text-gray-700" },
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("theater.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("theater.subtitle")}</p>
        </div>
        {session?.user && (
          <Link href="/theater/create">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              {t("theater.createTheater")}
            </Button>
          </Link>
        )}
      </div>

      {theaters.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <p>{t("theater.noTheaters")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {theaters.map((theater) => {
            const status = statusConfig[theater.status] || statusConfig.ended
            return (
              <Link key={theater.id} href={`/theater/${theater.id}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardContent className="p-0">
                    <div className="flex gap-4 p-4">
                      {/* 封面 */}
                      <div className="relative w-24 h-32 rounded-lg overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0">
                        {theater.coverUrl ? (
                          <Image
                            src={theater.coverUrl}
                            alt={theater.title}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-8 h-8 text-white" />
                          </div>
                        )}
                        <div className="absolute top-1 left-1">
                          <Badge className={`text-[10px] px-1.5 py-0.5 ${status.className}`}>
                            {status.label}
                          </Badge>
                        </div>
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base mb-1 truncate">{theater.title}</h3>
                        {theater.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {theater.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {t("theater.totalVotes", { count: theater._count.votes })}
                          </span>
                          <span>{theater._count.sessions} {t("studio.scenes")}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {theater.creator.image && (
                            <img
                              src={theater.creator.image}
                              alt=""
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {theater.creator.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
