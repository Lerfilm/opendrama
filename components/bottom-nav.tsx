"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Compass, User } from "@/components/icons"

export function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    { href: "/", icon: Home, label: "首页" },
    { href: "/discover", icon: Compass, label: "发现" },
    { href: "/profile", icon: User, label: "我的" },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border h-16 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-full max-w-screen-sm mx-auto">
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
