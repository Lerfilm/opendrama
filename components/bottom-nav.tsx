"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Compass, PenTool, Sparkles, User, Shield, Monitor } from "@/components/icons"
import { t } from "@/lib/i18n"

interface UserFlags {
  isAdmin: boolean
  isDevMode: boolean
}

export function BottomNav() {
  const pathname = usePathname()
  const [flags, setFlags] = useState<UserFlags | null>(null)

  useEffect(() => {
    fetch("/api/tokens/balance")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          setFlags({
            isAdmin: data.isAdmin ?? false,
            isDevMode: data.isDevMode ?? false,
          })
        }
      })
      .catch(() => {})
  }, [])

  // Dark pages use transparent dark nav
  const isDarkPage = pathname === "/discover" || pathname.startsWith("/discover") || pathname === "/studio" || pathname.startsWith("/studio")

  const navItems = [
    { key: "home", href: "/", icon: Home, label: t("nav.home"), accent: false },
    { key: "discover", href: "/discover", icon: Compass, label: t("nav.discover"), accent: false },
    { key: "create", href: "/studio", icon: PenTool, label: t("nav.create"), accent: true },
    { key: "cards", href: "/cards", icon: Sparkles, label: t("nav.cards"), accent: false },
    { key: "profile", href: "/profile", icon: User, label: t("nav.me"), accent: false },
  ]

  const showAdmin = flags?.isAdmin
  const showDev = flags?.isDevMode

  return (
    <>
      {/* Floating admin/dev shortcuts — above bottom nav, mobile only */}
      {(showAdmin || showDev) && (
        <div className="fixed bottom-[4.5rem] right-3 z-50 flex flex-col gap-2 md:hidden">
          {showDev && (
            <Link
              href="/dev"
              className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg backdrop-blur-md transition-all ${
                pathname.startsWith("/dev")
                  ? "bg-emerald-500 text-white"
                  : "bg-emerald-500/90 text-white hover:bg-emerald-600"
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span className="text-xs font-semibold">Dev</span>
            </Link>
          )}
          {showAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg backdrop-blur-md transition-all ${
                pathname.startsWith("/admin")
                  ? "bg-blue-500 text-white"
                  : "bg-blue-500/90 text-white hover:bg-blue-600"
              }`}
            >
              <Shield className="w-4 h-4" />
              <span className="text-xs font-semibold">Admin</span>
            </Link>
          )}
        </div>
      )}

      {/* Bottom navigation bar */}
      <nav className={`fixed bottom-0 left-0 right-0 backdrop-blur-md border-t safe-area-inset-bottom z-50 md:hidden ${
        isDarkPage
          ? "bg-black/70 border-white/5"
          : "bg-background/80 border-border/50"
      }`}>
        <div className="flex items-center justify-around h-16 max-w-screen-lg mx-auto">
          {navItems.map(({ key, href, icon: Icon, label, accent }) => {
            const isActive = pathname === href || (href !== "/" && pathname.startsWith(href))
            return (
              <Link
                key={key}
                href={href}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  isDarkPage
                    ? isActive
                      ? "text-purple-400"
                      : "text-white/30 hover:text-white/60"
                    : accent && !isActive
                      ? "text-primary/70 hover:text-primary"
                      : isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {accent ? (
                  <div className={`p-2 rounded-full -mt-5 ${
                    isDarkPage
                      ? isActive
                        ? "bg-purple-500 text-white shadow-lg shadow-purple-500/30"
                        : "bg-purple-500/20 text-purple-300"
                      : isActive
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                        : "bg-primary/10 text-primary animate-pulse-glow"
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center">
                    <Icon className="w-5 h-5 mb-1" />
                    {isActive && (
                      <span className={`absolute -bottom-1 w-1 h-1 rounded-full ${isDarkPage ? "bg-purple-400" : "bg-primary"}`} />
                    )}
                  </div>
                )}
                <span className={`text-[10px] font-medium ${accent ? "mt-0.5" : ""}`}>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
