"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Compass, PenTool, Film, Coins } from "@/components/icons"

interface TopNavProps {
  user?: { name?: string | null; image?: string | null } | null
  balance?: number
}

const navLinks = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/discover", icon: Compass, label: "Discover" },
  { href: "/studio", icon: PenTool, label: "Create" },
  { href: "/generate", icon: Film, label: "Theater" },
]

export function TopNav({ user, balance }: TopNavProps) {
  const pathname = usePathname()

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
        {navLinks.map(({ href, icon: Icon, label }) => {
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
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Right: Balance + User */}
      <div className="flex items-center gap-3 shrink-0">
        {user ? (
          <>
            {balance !== undefined && (
              <Link href="/recharge" className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1.5 rounded-full transition-colors">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{balance.toLocaleString()}</span>
              </Link>
            )}
            <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {user.image ? (
                <img src={user.image} alt={user.name || ""} className="w-8 h-8 rounded-full ring-2 ring-border" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {user.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
            </Link>
          </>
        ) : (
          <Link
            href="/auth/signin"
            className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  )
}
