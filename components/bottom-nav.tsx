"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Compass, PenTool, Play, User } from "@/components/icons"
import { t } from "@/lib/i18n"

export function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    { key: "home", href: "/", icon: Home, label: t("nav.home"), accent: false },
    { key: "create", href: "/studio", icon: PenTool, label: t("nav.create"), accent: false },
    { key: "watch", href: "/discover", icon: Play, label: t("nav.watch"), accent: true },
    { key: "discover", href: "/discover", icon: Compass, label: t("nav.discover"), accent: false },
    { key: "profile", href: "/profile", icon: User, label: t("nav.profile"), accent: false },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border/50 safe-area-inset-bottom z-50 md:hidden">
      <div className="flex items-center justify-around h-16 max-w-screen-lg mx-auto">
        {navItems.map(({ key, href, icon: Icon, label, accent }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href))
          return (
            <Link
              key={key}
              href={href}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                accent && !isActive
                  ? "text-primary/70 hover:text-primary"
                  : isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {accent ? (
                <div className={`p-2 rounded-full -mt-5 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : "bg-primary/10 text-primary animate-pulse-glow"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
              ) : (
                <div className="relative flex flex-col items-center">
                  <Icon className="w-5 h-5 mb-1" />
                  {isActive && (
                    <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
              )}
              <span className={`text-[10px] font-medium ${accent ? "mt-0.5" : ""}`}>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
