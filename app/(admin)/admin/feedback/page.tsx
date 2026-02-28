"use client"

import { useEffect, useState, useCallback } from "react"
import { t } from "@/lib/i18n"

interface FeedbackItem {
  id: string
  userId: string | null
  email: string | null
  category: string
  content: string
  page: string | null
  status: string
  adminNote: string | null
  createdAt: string
  user: { id: string; name: string | null; email: string | null; image: string | null } | null
}

interface Summary {
  newCount: number
  pendingCount: number
  todayCount: number
}

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-blue-100 text-blue-800",
  bug: "bg-red-100 text-red-800",
  feature: "bg-green-100 text-green-800",
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-amber-100 text-amber-800",
  read: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [summary, setSummary] = useState<Summary>({ newCount: 0, pendingCount: 0, todayCount: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchFeedback = useCallback(async (status: string, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" })
      if (status !== "all") params.set("status", status)
      const res = await fetch(`/api/admin/feedback?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setSummary(data.summary || { newCount: 0, pendingCount: 0, todayCount: 0 })
        setTotalPages(data.totalPages || 1)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeedback(filter, page)
  }, [filter, page, fetchFeedback])

  const updateFeedback = async (id: string, patch: { status?: string; adminNote?: string }) => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      })
      if (res.ok) {
        const { feedback } = await res.json()
        setItems(prev => prev.map(item => item.id === id ? { ...item, ...feedback } : item))
        // Refresh summary
        fetchFeedback(filter, page)
      }
    } finally {
      setSaving(false)
    }
  }

  const toggleExpand = (item: FeedbackItem) => {
    if (expandedId === item.id) {
      setExpandedId(null)
    } else {
      setExpandedId(item.id)
      setNoteText(item.adminNote || "")
      // Auto-mark as read
      if (item.status === "new") {
        updateFeedback(item.id, { status: "read" })
      }
    }
  }

  const filters = [
    { key: "all", label: t("admin.feedback.all") },
    { key: "new", label: t("admin.feedback.new") },
    { key: "read", label: t("admin.feedback.read") },
    { key: "resolved", label: t("admin.feedback.resolved") },
  ]

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("admin.feedback.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("admin.feedback.desc")}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{summary.newCount}</div>
          <div className="text-xs text-muted-foreground">{t("admin.feedback.briefNew")}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{summary.pendingCount}</div>
          <div className="text-xs text-muted-foreground">{t("admin.feedback.briefPending")}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{summary.todayCount}</div>
          <div className="text-xs text-muted-foreground">{t("admin.feedback.briefToday")}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1) }}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feedback list */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">{t("admin.feedback.noFeedback")}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border bg-card overflow-hidden">
              {/* Header row */}
              <button
                onClick={() => toggleExpand(item)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              >
                {/* User avatar */}
                {item.user?.image ? (
                  <img src={item.user.image} alt="" className="w-7 h-7 rounded-full shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs shrink-0">
                    ?
                  </div>
                )}

                {/* Content preview */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {item.user?.name || item.user?.email || item.email || t("admin.feedback.anonymous")}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category] || ""}`}>
                      {t(`admin.feedback.category.${item.category}`)}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || ""}`}>
                      {t(`admin.feedback.${item.status}`)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{item.content}</p>
                </div>

                {/* Time */}
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </button>

              {/* Expanded detail */}
              {expandedId === item.id && (
                <div className="px-4 pb-4 border-t bg-muted/10">
                  <div className="mt-3 mb-2">
                    <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                  </div>

                  {item.page && (
                    <p className="text-[11px] text-muted-foreground mb-3">
                      {t("admin.feedback.page")}: <span className="font-mono">{item.page}</span>
                    </p>
                  )}

                  {/* Admin note */}
                  <div className="mb-3">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.feedback.adminNote")}</label>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder={t("admin.feedback.addNote")}
                      rows={2}
                      className="w-full text-sm px-3 py-2 rounded-md border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                    {noteText !== (item.adminNote || "") && (
                      <button
                        onClick={() => updateFeedback(item.id, { adminNote: noteText })}
                        disabled={saving}
                        className="mt-1 text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {t("admin.feedback.saveNote")}
                      </button>
                    )}
                  </div>

                  {/* Status actions */}
                  <div className="flex gap-2">
                    {item.status !== "read" && (
                      <button
                        onClick={() => updateFeedback(item.id, { status: "read" })}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 rounded-md bg-blue-100 text-blue-800 font-medium hover:bg-blue-200 disabled:opacity-50"
                      >
                        {t("admin.feedback.markRead")}
                      </button>
                    )}
                    {item.status !== "resolved" && (
                      <button
                        onClick={() => updateFeedback(item.id, { status: "resolved" })}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 rounded-md bg-green-100 text-green-800 font-medium hover:bg-green-200 disabled:opacity-50"
                      >
                        {t("admin.feedback.markResolved")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-8 px-3 rounded border text-sm disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="h-8 px-3 rounded border text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
