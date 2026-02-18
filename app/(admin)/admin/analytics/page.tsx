export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { t } from "@/lib/i18n"

async function getOverview() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [totalUsers, todayNewUsers, totalRevenue, totalWatchDuration] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.purchase.aggregate({
        where: { status: "completed" },
        _sum: { amount: true },
      }),
      prisma.watchEvent.aggregate({
        _sum: { watchDuration: true },
      }),
    ])

  return {
    totalUsers,
    todayNewUsers,
    totalRevenue: totalRevenue._sum.amount ?? 0,
    totalWatchDuration: totalWatchDuration._sum.watchDuration ?? 0,
  }
}

async function getUserTrend() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const rows = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
    FROM users
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `
  return rows.map((r) => ({ date: String(r.date).slice(0, 10), count: Number(r.count) }))
}

async function getTopSeries() {
  const rows = await prisma.$queryRaw<
    { id: string; title: string; watch_count: bigint }[]
  >`
    SELECT s.id, s.title, COUNT(w.id)::bigint as watch_count
    FROM series s
    JOIN episodes e ON e."seriesId" = s.id
    JOIN watch_events w ON w."episodeId" = e.id
    GROUP BY s.id, s.title
    ORDER BY watch_count DESC
    LIMIT 10
  `
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    watchCount: Number(r.watch_count),
  }))
}

async function getRevenueTrend() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const rows = await prisma.$queryRaw<{ date: string; total: bigint }[]>`
    SELECT DATE("createdAt") as date, SUM(amount)::bigint as total
    FROM purchases
    WHERE status = 'completed' AND "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `
  return rows.map((r) => ({ date: String(r.date).slice(0, 10), total: Number(r.total) }))
}

async function getFunnel() {
  const [registered, firstWatch, firstPay, repurchase] = await Promise.all([
    prisma.user.count(),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint as count FROM watch_events
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint as count FROM purchases WHERE status = 'completed'
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint as count FROM (
        SELECT "userId" FROM purchases WHERE status = 'completed'
        GROUP BY "userId" HAVING COUNT(*) >= 2
      ) sub
    `.then((r) => Number(r[0]?.count ?? 0)),
  ])

  return [
    { label: t("analytics.registered"), value: registered },
    { label: t("analytics.firstWatch"), value: firstWatch },
    { label: t("analytics.firstPay"), value: firstPay },
    { label: t("analytics.repurchase"), value: repurchase },
  ]
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h.toLocaleString()}h ${m}m`
  return `${m}m`
}

function formatCents(cents: number): string {
  return `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
}

export default async function AnalyticsPage() {
  const [overview, userTrend, topSeries, revenueTrend, funnel] =
    await Promise.all([
      getOverview(),
      getUserTrend(),
      getTopSeries(),
      getRevenueTrend(),
      getFunnel(),
    ])

  const maxUserCount = Math.max(...userTrend.map((d) => d.count), 1)
  const maxRevenue = Math.max(...revenueTrend.map((d) => d.total), 1)
  const funnelMax = Math.max(funnel[0]?.value ?? 1, 1)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t("analytics.title")}</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("analytics.totalUsers"), value: overview.totalUsers.toLocaleString(), color: "bg-blue-500" },
          { label: t("analytics.totalRevenue"), value: formatCents(overview.totalRevenue), color: "bg-green-500" },
          { label: t("analytics.totalWatchTime"), value: formatDuration(overview.totalWatchDuration), color: "bg-purple-500" },
          { label: t("analytics.todayNew"), value: overview.todayNewUsers.toLocaleString(), color: "bg-orange-500" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-background rounded-lg border p-6 relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full ${kpi.color}`} />
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="text-2xl font-bold mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* User Growth Chart */}
      <div className="bg-background rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">{t("analytics.userGrowth")}</h2>
        {userTrend.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("common.noData")}</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {userTrend.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="absolute -top-8 bg-foreground text-background text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
                  {d.date.slice(5)}: {d.count}
                </div>
                <div
                  className="w-full bg-blue-500 rounded-t min-h-[2px] transition-all"
                  style={{ height: `${(d.count / maxUserCount) * 100}%` }}
                />
                <span className="text-[9px] text-muted-foreground rotate-[-45deg] origin-top-left w-0 overflow-visible whitespace-nowrap">
                  {d.date.slice(8)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top 10 Series */}
        <div className="bg-background rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">{t("analytics.topSeries")}</h2>
          {topSeries.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("common.noData")}</p>
          ) : (
            <div className="space-y-3">
              {topSeries.map((s, i) => {
                const maxWatch = topSeries[0]?.watchCount ?? 1
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="text-sm font-mono text-muted-foreground w-6 text-right">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate">{s.title}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                          {s.watchCount.toLocaleString()} {t("analytics.times")}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${(s.watchCount / maxWatch) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Revenue Trend */}
        <div className="bg-background rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">{t("analytics.revenueTrend")}</h2>
          {revenueTrend.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("common.noData")}</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {revenueTrend.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="absolute -top-8 bg-foreground text-background text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
                    {d.date.slice(5)}: {formatCents(d.total)}
                  </div>
                  <div
                    className="w-full bg-green-500 rounded-t min-h-[2px] transition-all"
                    style={{ height: `${(d.total / maxRevenue) * 100}%` }}
                  />
                  <span className="text-[9px] text-muted-foreground rotate-[-45deg] origin-top-left w-0 overflow-visible whitespace-nowrap">
                    {d.date.slice(8)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Retention Funnel */}
      <div className="bg-background rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">{t("analytics.funnel")}</h2>
        <div className="space-y-4">
          {funnel.map((step, i) => {
            const pct = funnelMax > 0 ? (step.value / funnelMax) * 100 : 0
            const prevValue = i > 0 ? funnel[i - 1].value : null
            const convRate = prevValue && prevValue > 0 ? ((step.value / prevValue) * 100).toFixed(1) : null
            return (
              <div key={step.label} className="flex items-center gap-4">
                <span className="text-sm w-20 shrink-0">{step.label}</span>
                <div className="flex-1 h-8 bg-muted rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-end pr-3 transition-all"
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  >
                    <span className="text-xs font-medium text-white whitespace-nowrap">
                      {step.value.toLocaleString()}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right">
                  {convRate ? `${convRate}%` : "—"}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
