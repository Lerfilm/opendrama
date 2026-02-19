export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Coins } from "@/components/icons"
import Link from "next/link"
import Image from "next/image"
import { t } from "@/lib/i18n"

export default async function HomePage() {
  const session = await auth()

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OpenDrama</h1>
          <p className="text-sm text-muted-foreground">
            {session?.user
              ? t("home.greeting", { name: session.user?.name || "" })
              : t("home.welcomeGuest")}
          </p>
        </div>
        {session?.user ? (
          <div className="flex items-center gap-2 bg-primary/10 rounded-full px-4 py-2">
            <Coins className="w-5 h-5 text-primary" />
            <span className="font-semibold">{(session.user as any)?.coins || 0}</span>
          </div>
        ) : (
          <Link href="/auth/signin">
            <Button size="sm">{t("common.login")}</Button>
          </Link>
        )}
      </div>

      <Link href="/recharge">
        <div className="relative aspect-[2/1] sm:aspect-[16/9] bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow">
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">{t("home.recharge")}</h2>
              <p className="text-sm mb-4">{t("home.rechargeDesc")}</p>
              <Button variant="secondary" size="sm">
                {t("home.rechargeNow")}
              </Button>
            </div>
          </div>
        </div>
      </Link>

      <div>
        <h2 className="text-lg font-semibold mb-3">{t("home.hotPicks")}</h2>
        {seriesWithCount.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{t("home.noSeries")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
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
                          {t("common.noCover")}
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="text-xs">
                          {series.status === "active" ? t("common.ongoing") : t("common.completed")}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <h3 className="font-medium text-sm line-clamp-2 mb-1">
                      {series.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {t("home.episodeCount", { count: series.episodeCount })}
                    </p>
                  </CardContent>
                  <CardFooter className="p-3 pt-0">
                    <Button size="sm" className="w-full" variant="outline">
                      <Play className="w-4 h-4 mr-1" />
                      {t("home.startWatch")}
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
