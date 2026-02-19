"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Compass, User } from "@/components/icons"
import { t } from "@/lib/i18n"

export function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/discover", icon: Compass, label: t("nav.discover") },
    { href: "/profile", icon: User, label: t("nav.profile") },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border safe-area-inset-bottom z-50">
      <div className="flex items-center justify-around h-16 max-w-screen-md mx-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
