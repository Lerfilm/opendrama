"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Code } from "@/components/icons"
import { t } from "@/lib/i18n"
import { RechargeModal } from "./recharge-modal"
import { CommandPalette } from "./command-palette"

interface TopBarProps {
  user: { name?: string | null; email?: string | null; image?: string | null }
  balance?: number
  className?: string
}

export function TopBar({ user, balance, className }: TopBarProps) {
  const pathname = usePathname()
  const [showRecharge, setShowRecharge] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return
    function handle(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [showUserMenu])

  // ⌘K global shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setShowSearch(true)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  const closeSearch = useCallback(() => setShowSearch(false), [])

  // Detect which module we're in and extract scriptId
  const moduleMatch = pathname.match(/^\/dev\/(script|casting|location|props|theater|editing|finishing|media)\/([^/]+)/)
  const currentModule = moduleMatch?.[1] ?? null
  const moduleLabels: Record<string, string> = {
    script: t("dev.topbar.moduleScript"),
    casting: t("dev.topbar.moduleCasting"),
    location: t("dev.topbar.moduleLocation"),
    props: t("dev.topbar.moduleProps"),
    theater: t("dev.topbar.moduleTheater"),
    editing: t("dev.topbar.moduleEditing"),
    finishing: t("dev.topbar.moduleFinishing"),
    media: t("dev.topbar.moduleMedia"),
  }
  const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || "V1.0.dev"
  const isInModule = !!currentModule

  return (
    <>
      <header
        className={`flex items-center justify-between px-3 gap-4 ${className || ""}`}
        style={{ background: "#1C1C1E", borderBottom: "1px solid #0A0A0C" }}
      >
        {/* Left: Logo + Projects breadcrumb */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/dev" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Code className="w-3 h-3 text-white" />
            </div>
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: "#FFFFFF" }}>OpenDrama</span>
            <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ background: "rgba(99,102,241,0.35)", color: "#A5B4FC" }}>DEV</span>
          </Link>

          {/* Divider */}
          <div className="w-px h-4 mx-1" style={{ background: "#333" }} />

          {/* Projects nav */}
          <Link
            href="/dev"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors"
            style={{
              color: isInModule ? "#A0A0A8" : "#FFFFFF",
              background: isInModule ? "transparent" : "rgba(255,255,255,0.10)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h7v7H3z" />
              <path d="M14 3h7v7h-7z" />
              <path d="M3 14h7v7H3z" />
              <path d="M14 14h7v7h-7z" />
            </svg>
            {t("dev.topbar.projects")}
          </Link>

          {isInModule && currentModule && (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#555" }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span className="text-[11px] font-medium" style={{ color: "#F0F0F0" }}>{moduleLabels[currentModule]}</span>
            </>
          )}
        </div>

        {/* Center: Search — opens command palette */}
        <div className="flex-1 max-w-sm">
          <button
            onClick={() => setShowSearch(true)}
            className="w-full h-6 flex items-center gap-2 pl-2.5 pr-2 text-[11px] rounded transition-colors hover:border-[#555]"
            style={{
              background: "#2A2A2E",
              border: "1px solid #3A3A3E",
              color: "#666",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="flex-1 text-left">{t("dev.topbar.search")}</span>
            <kbd className="text-[9px] font-mono" style={{ color: "#555" }}>⌘K</kbd>
          </button>
        </div>

        {/* Right: Balance + Status + User */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Balance / Recharge button */}
          {balance !== undefined && (
            <>
              <button
                onClick={() => setShowRecharge(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all hover:opacity-90"
                style={{ background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.4)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#F59E0B" }}>
                  <circle cx="12" cy="12" r="10" fill="#F59E0B" opacity="0.2" />
                  <text x="12" y="16" textAnchor="middle" fontSize="12" fill="#F59E0B" fontWeight="bold">¢</text>
                </svg>
                <span className="text-[12px] font-semibold" style={{ color: "#F59E0B" }}>
                  {balance.toLocaleString()}
                </span>
                <span className="text-[9px] font-medium px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.28)", color: "#FCD34D" }}>
                  {t("dev.topbar.recharge")}
                </span>
              </button>
              <div className="w-px h-4" style={{ background: "#333" }} />
            </>
          )}

          <div className="w-px h-4" style={{ background: "#333" }} />

          {/* Status */}
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#9CA3AF" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{t("dev.topbar.ready")}</span>
          </div>

          <div className="w-px h-4" style={{ background: "#333" }} />

          {/* User avatar + dropdown */}
          <div ref={userMenuRef} className="relative">
            <button onClick={() => setShowUserMenu(o => !o)} className="flex items-center rounded-full transition-opacity hover:opacity-80">
              {user.image ? (
                <img src={user.image} alt={user.name || ""} className="w-6 h-6 rounded-full" style={{ outline: "1px solid #444" }} />
              ) : (
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ background: "#3A3A3E", color: "#C0C0C0" }}>
                  {user.name?.[0] || "U"}
                </div>
              )}
            </button>

            {/* User dropdown menu */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 z-50 rounded-lg shadow-xl overflow-hidden"
                style={{ minWidth: 220, background: "#2A2A2E", border: "1px solid #444" }}>
                {/* User info */}
                <div className="px-4 py-3" style={{ borderBottom: "1px solid #3A3A3E" }}>
                  <div className="flex items-center gap-3">
                    {user.image ? (
                      <img src={user.image} alt={user.name || ""} className="w-10 h-10 rounded-full flex-shrink-0" style={{ outline: "1px solid #555" }} />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: "#3A3A3E", color: "#C0C0C0" }}>
                        {user.name?.[0] || "U"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium truncate" style={{ color: "#F0F0F0" }}>
                        {user.name || "User"}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: "#888" }}>
                        {user.email || ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <Link href="/dev" onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 px-4 py-2 text-[11px] transition-colors hover:bg-white/5"
                    style={{ color: "#C0C0C0" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M3 3h7v7H3z" /><path d="M14 3h7v7h-7z" /><path d="M3 14h7v7H3z" /><path d="M14 14h7v7h-7z" />
                    </svg>
                    {t("dev.topbar.projects")}
                  </Link>
                  <Link href="/" onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 px-4 py-2 text-[11px] transition-colors hover:bg-white/5"
                    style={{ color: "#C0C0C0" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    {t("dev.topbar.home")}
                  </Link>
                </div>

                {/* Divider + Logout */}
                <div style={{ borderTop: "1px solid #3A3A3E" }}>
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-[11px] transition-colors hover:bg-white/5"
                    style={{ color: "#EF4444" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" x2="9" y1="12" y2="12" />
                    </svg>
                    {t("dev.topbar.logout")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Recharge modal */}
      {showRecharge && balance !== undefined && (
        <RechargeModal balance={balance} onClose={() => setShowRecharge(false)} />
      )}

      {/* Command palette (⌘K search) */}
      <CommandPalette open={showSearch} onClose={closeSearch} />
    </>
  )
}
