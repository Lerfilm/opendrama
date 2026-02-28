"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Edit, Trash2 } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

interface SeriesItem {
  id: string
  title: string
  description?: string | null
  coverUrl?: string | null
  status: string
  createdAt: string
  _count: { episodes: number }
}

export default function AdminSeriesPage() {
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function fetchSeries() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/series")
      if (res.ok) {
        const data = await res.json()
        setSeriesList(data.series || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSeries() }, [])

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/series/${id}`, { method: "DELETE" })
      if (res.ok) {
        setSeriesList(prev => prev.filter(s => s.id !== id))
      } else {
        alert("Delete failed")
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggleStatus(id: string, currentStatus: string) {
    setTogglingId(id)
    const newStatus = currentStatus === "active" ? "inactive" : "active"
    try {
      const res = await fetch(`/api/admin/series/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setSeriesList(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s))
      } else {
        alert("Update failed")
      }
    } finally {
      setTogglingId(null)
    }
  }

  const filtered = seriesList.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t("admin.series.title")}</h1>
        <p className="text-muted-foreground">{t("admin.series.desc")}</p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search series by title..."
          className="h-9 px-3 rounded-md border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ minWidth: 260 }}
        />
        <span className="text-sm text-muted-foreground">{filtered.length} series</span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {search ? `No series matching "${search}"` : t("admin.series.noSeries")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((series) => (
            <Card key={series.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4 flex-1">
                    {series.coverUrl && (
                      <img src={series.coverUrl} alt={series.title} className="w-24 h-32 object-cover rounded" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold">{series.title}</h3>
                        <Badge variant={series.status === "active" ? "default" : "secondary"}>
                          {series.status === "active" ? t("admin.series.online") : t("admin.series.offline")}
                        </Badge>
                      </div>
                      {series.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{series.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{t("home.episodeCount", { count: series._count.episodes })}</span>
                        <span>{t("admin.series.createdAt")}{new Date(series.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus(series.id, series.status)}
                      disabled={togglingId === series.id}
                    >
                      {togglingId === series.id ? "..." : series.status === "active" ? "Unpublish" : "Publish"}
                    </Button>
                    <Link href={`/admin/series/${series.id}`}>
                      <Button variant="outline" size="sm">
                        <Edit className="w-4 h-4 mr-1" />
                        {t("common.edit")}
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(series.id, series.title)}
                      disabled={deletingId === series.id}
                    >
                      {deletingId === series.id
                        ? <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin inline-block" />
                        : <Trash2 className="w-4 h-4 text-destructive" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
