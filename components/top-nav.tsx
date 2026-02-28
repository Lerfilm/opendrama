"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Compass, PenTool, Film, Coins, Sparkles, Shield, Monitor } from "@/components/icons"
import { t } from "@/lib/i18n"

const navKeys = [
  { href: "/", icon: Home, key: "nav.home" },
  { href: "/discover", icon: Compass, key: "nav.discover" },
  { href: "/studio", icon: PenTool, key: "nav.create" },
  { href: "/cards", icon: Sparkles, key: "nav.cards" },
]

interface UserData {
  name?: string | null
  image?: string | null
  balance?: number
  isAdmin?: boolean
  isDevMode?: boolean
}

export function TopNav() {
  const pathname = usePathname()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch("/api/tokens/balance")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          setUserData({
            name: data.userName || null,
            image: data.userImage || null,
            balance: data.available ?? data.balance ?? 0,
            isAdmin: data.isAdmin ?? false,
            isDevMode: data.isDevMode ?? false,
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  return (
    <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-14 items-center justify-between px-6 bg-background/80 backdrop-blur-lg border-b border-border/50">
      {/* Left: Logo */}
      <Link href="/" className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Film className="w-4 h-4 text-white" />
        </div>
        <span className="text-base font-bold tracking-tight">OpenDrama</span>
      </Link>

      {/* Center: Nav links */}
      <nav className="flex items-center gap-1">
        {navKeys.map(({ href, icon: Icon, key }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t(key)}
            </Link>
          )
        })}
      </nav>

      {/* Right: Balance + User */}
      <div className="flex items-center gap-3 shrink-0">
        {!loaded ? (
          <div className="w-20 h-8" />
        ) : userData ? (
          <>
            {userData.balance !== undefined && (
              <Link href="/recharge" className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1.5 rounded-full transition-colors">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{userData.balance.toLocaleString()}</span>
              </Link>
            )}
            {userData.isDevMode && (
              <Link href="/dev" className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors" title={t("profile.devDashboard")}>
                <Monitor className="w-4 h-4 text-emerald-500" />
              </Link>
            )}
            {userData.isAdmin && (
              <Link href="/admin" className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 hover:bg-blue-500/20 transition-colors" title={t("profile.adminPanel")}>
                <Shield className="w-4 h-4 text-blue-500" />
              </Link>
            )}
            <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {userData.image ? (
                <img src={userData.image} alt={userData.name || ""} className="w-8 h-8 rounded-full ring-2 ring-border" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {userData.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
            </Link>
          </>
        ) : (
          <Link
            href="/auth/signin"
            className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            {t("common.login")}
          </Link>
        )}
      </div>
    </header>
  )
}
