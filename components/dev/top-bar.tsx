"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Code } from "@/components/icons"

interface TopBarProps {
  user: { name?: string | null; email?: string | null; image?: string | null }
  balance?: number
  className?: string
}

export function TopBar({ user, balance, className }: TopBarProps) {
  const pathname = usePathname()

  // Detect which module we're in and extract scriptId
  const moduleMatch = pathname.match(/^\/dev\/(script|casting|location|props|theater|editing|finishing|media)\/([^/]+)/)
  const currentModule = moduleMatch?.[1] ?? null
  const moduleLabels: Record<string, string> = {
    script: "Script",
    casting: "Casting",
    location: "Location Scout",
    props: "Props",
    theater: "Theater",
    editing: "Editing",
    finishing: "Finishing",
    media: "Media Library",
  }
  const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || "V1.0.dev"
  const isInModule = !!currentModule

  return (
    <header
      className={`flex items-center justify-between px-3 gap-4 ${className || ""}`}
      style={{ background: "#2C2C2C", borderBottom: "1px solid #1A1A1A" }}
    >
      {/* Left: Logo + Projects breadcrumb */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link href="/dev" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Code className="w-3 h-3 text-white" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: "#E0E0E0" }}>OpenDrama</span>
          <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ background: "rgba(99,102,241,0.3)", color: "#A5B4FC" }}>DEV</span>
        </Link>

        {/* Divider */}
        <div className="w-px h-4 mx-1" style={{ background: "#444" }} />

        {/* Projects nav */}
        <Link
          href="/dev"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors"
          style={{ color: isInModule ? "#888" : "#E0E0E0", background: isInModule ? "transparent" : "rgba(255,255,255,0.08)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h7v7H3z" />
            <path d="M14 3h7v7h-7z" />
            <path d="M3 14h7v7H3z" />
            <path d="M14 14h7v7h-7z" />
          </svg>
          Projects
        </Link>

        {isInModule && currentModule && (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#555" }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-[11px] font-medium" style={{ color: "#D0D0D0" }}>{moduleLabels[currentModule]}</span>
          </>
        )}
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: "#555" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            className="w-full h-6 pl-7 pr-8 text-[11px] rounded focus:outline-none"
            style={{
              background: "#3C3C3C",
              border: "1px solid #4A4A4A",
              color: "#B0B0B0",
            }}
            disabled
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono" style={{ color: "#555" }}>⌘K</kbd>
        </div>
      </div>

      {/* Right: Balance + Status + User */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Balance display */}
        {balance !== undefined && (
          <>
            <Link
              href="/recharge"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all"
              style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#F59E0B" }}>
                <circle cx="12" cy="12" r="10" fill="#F59E0B" opacity="0.2" />
                <text x="12" y="16" textAnchor="middle" fontSize="12" fill="#F59E0B" fontWeight="bold">¢</text>
              </svg>
              <span className="text-[12px] font-semibold" style={{ color: "#F59E0B" }}>
                {balance.toLocaleString()}
              </span>
              <span className="text-[9px] font-medium px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.25)", color: "#F59E0B" }}>
                + Recharge
              </span>
            </Link>
            <div className="w-px h-4" style={{ background: "#3A3A3A" }} />
          </>
        )}
        {/* Build version */}
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: "rgba(99,102,241,0.15)", color: "#6366F1", letterSpacing: "0.02em" }}
          title={`Build: ${buildVersion}`}
        >
          {buildVersion}
        </span>
        <div className="w-px h-4" style={{ background: "#3A3A3A" }} />
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#666" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Ready</span>
        </div>
        <div className="w-px h-4" style={{ background: "#3A3A3A" }} />
        {user.image ? (
          <img src={user.image} alt={user.name || ""} className="w-6 h-6 rounded-full" style={{ outline: "1px solid #444" }} />
        ) : (
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ background: "#444", color: "#AAA" }}>
            {user.name?.[0] || "U"}
          </div>
        )}
      </div>
    </header>
  )
}
