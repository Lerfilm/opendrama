"use client"

import { useEffect, useState, useCallback } from "react"
import { t } from "@/lib/i18n"

interface UserRow {
  id: string
  name: string | null
  email: string | null
  image: string | null
  createdAt: string
  availableBalance: number
  balance: {
    balance: number
    reserved: number
    totalPurchased: number
    totalConsumed: number
  } | null
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Grant dialog
  const [grantUser, setGrantUser] = useState<UserRow | null>(null)
  const [grantAmount, setGrantAmount] = useState("")
  const [grantNote, setGrantNote] = useState("")
  const [granting, setGranting] = useState(false)
  const [grantMessage, setGrantMessage] = useState("")

  const fetchUsers = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" })
      if (q) params.set("q", q)
      const res = await fetch(`/api/admin/users?${params}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
        setTotalPages(data.totalPages || 1)
        setTotal(data.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers(query, page)
  }, [page, fetchUsers]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(1)
    fetchUsers(query, 1)
  }

  const handleGrant = async () => {
    if (!grantUser) return
    const amount = parseInt(grantAmount)
    if (!amount || amount < 1) return

    setGranting(true)
    setGrantMessage("")
    try {
      const res = await fetch(`/api/admin/users/${grantUser.id}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note: grantNote || undefined }),
      })
      if (res.ok) {
        const data = await res.json()
        setGrantMessage(t("admin.users.grantSuccess", { amount: String(data.granted), name: data.user.name || data.user.email || "User" }))
        // Refresh user list
        fetchUsers(query, page)
        setTimeout(() => {
          setGrantUser(null)
          setGrantAmount("")
          setGrantNote("")
          setGrantMessage("")
        }, 1500)
      } else {
        const data = await res.json()
        setGrantMessage(data.error || "Failed")
      }
    } finally {
      setGranting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("admin.users.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("admin.users.desc")}</p>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={t("admin.users.search")}
          className="flex-1 h-9 px-3 rounded-md border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleSearch}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          {t("common.search")}
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-3">{t("admin.users.usersFound", { total: String(total) })}</p>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-24">{t("admin.users.balance")}</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-24">{t("admin.users.reserved")}</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-28">{t("admin.users.totalPurchased")}</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-28">{t("admin.users.totalConsumed")}</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-24">{t("admin.users.joined")}</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-28"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">{t("common.loading")}</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">{t("admin.users.noUsers")}</td></tr>
            ) : (
              users.map((user, i) => (
                <tr key={user.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.image ? (
                        <img src={user.image} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs">
                          {(user.name || user.email || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-sm">{user.name || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{user.email || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono">{user.availableBalance}</td>
                  <td className="px-4 py-3 text-center font-mono text-muted-foreground">{user.balance?.reserved ?? 0}</td>
                  <td className="px-4 py-3 text-center font-mono text-green-600">{user.balance?.totalPurchased ?? 0}</td>
                  <td className="px-4 py-3 text-center font-mono text-orange-600">{user.balance?.totalConsumed ?? 0}</td>
                  <td className="px-4 py-3 text-center text-[11px] text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => { setGrantUser(user); setGrantAmount(""); setGrantNote(""); setGrantMessage("") }}
                      className="text-xs px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 font-medium hover:bg-amber-200 transition-colors"
                    >
                      {t("admin.users.grantTokens")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-8 px-3 rounded border text-sm disabled:opacity-40"
          >
            {t("common.prev")}
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="h-8 px-3 rounded border text-sm disabled:opacity-40"
          >
            {t("common.next")}
          </button>
        </div>
      )}

      {/* Grant Dialog */}
      {grantUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setGrantUser(null)}>
          <div className="bg-background rounded-xl shadow-xl p-6 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">{t("admin.users.grantTokens")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {grantUser.name || grantUser.email} — {t("admin.users.balance")}: {grantUser.availableBalance}
            </p>

            <label className="text-sm font-medium mb-1 block">{t("admin.users.grantAmount")}</label>
            <input
              type="number"
              min="1"
              max="100000"
              value={grantAmount}
              onChange={(e) => setGrantAmount(e.target.value)}
              className="w-full h-9 px-3 rounded-md border text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />

            <label className="text-sm font-medium mb-1 block">{t("admin.users.grantNote")}</label>
            <input
              type="text"
              value={grantNote}
              onChange={(e) => setGrantNote(e.target.value)}
              placeholder={t("admin.users.notePlaceholder")}
              className="w-full h-9 px-3 rounded-md border text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {grantMessage && (
              <p className={`text-sm mb-3 ${grantMessage.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
                {grantMessage}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setGrantUser(null)}
                className="h-9 px-4 rounded-md border text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleGrant}
                disabled={granting || !grantAmount || parseInt(grantAmount) < 1}
                className="h-9 px-4 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {granting ? t("common.processing") : t("admin.users.grantConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
