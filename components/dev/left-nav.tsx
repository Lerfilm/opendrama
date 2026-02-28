"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { t } from "@/lib/i18n"
import { SettingsPanel } from "./settings-panel"

interface RecentProject {
  id: string
  title: string
}

export function LeftNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [showSettings, setShowSettings] = useState(false)
  const [pickerModule, setPickerModule] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click
  useEffect(() => {
    if (!pickerModule) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerModule(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [pickerModule])

  // Load recent projects on demand
  const openPicker = async (moduleId: string) => {
    setPickerModule(moduleId)
    if (!projectsLoaded) {
      try {
        const res = await fetch("/api/scripts?limit=5")
        if (res.ok) {
          const data = await res.json()
          setRecentProjects(
            (data.scripts || []).slice(0, 5).map((s: { id: string; title: string }) => ({
              id: s.id,
              title: s.title,
            }))
          )
        }
      } catch { /* ignore */ }
      setProjectsLoaded(true)
    }
  }

  const selectProject = (moduleId: string, projectId: string) => {
    setPickerModule(null)
    router.push(`/dev/${moduleId}/${projectId}`)
  }

  // Extract scriptId from any of the module paths:
  // /dev/script/[id], /dev/casting/[id], /dev/theater/[id], /dev/editing/[id], /dev/finishing/[id], /dev/media/[id]
  const modulePathMatch = pathname.match(/^\/dev\/(?:script|casting|location|props|theater|editing|finishing|media)\/([^/]+)/)
  const scriptId = modulePathMatch?.[1] ?? null

  const navItems = [
    {
      id: "script",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      label: t("dev.nav.script"),
      href: scriptId ? `/dev/script/${scriptId}` : "/dev",
      enabled: true,
      active: pathname.startsWith("/dev/script/") || pathname === "/dev",
    },
    {
      id: "casting",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      label: t("dev.nav.casting"),
      href: scriptId ? `/dev/casting/${scriptId}` : "/dev",
      enabled: !!scriptId,
      active: pathname.startsWith("/dev/casting/"),
    },
    {
      id: "location",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
      label: t("dev.nav.location"),
      href: scriptId ? `/dev/location/${scriptId}` : "/dev",
      enabled: !!scriptId,
      active: pathname.startsWith("/dev/location/"),
    },
    {
      id: "props",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.29 7 12 12 20.71 7" />
          <line x1="12" y1="22" x2="12" y2="12" />
        </svg>
      ),
      label: t("dev.nav.props"),
      href: scriptId ? `/dev/props/${scriptId}` : "/dev",
      enabled: !!scriptId,
      active: pathname.startsWith("/dev/props/"),
    },
    {
      id: "theater",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
      label: t("dev.nav.theater"),
      href: scriptId ? `/dev/theater/${scriptId}` : "/dev",
      enabled: !!scriptId,
      active: pathname.startsWith("/dev/theater/"),
    },
    {
      id: "editing",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <line x1="9" x2="9" y1="3" y2="21" />
        </svg>
      ),
      label: t("dev.nav.editing"),
      href: scriptId ? `/dev/editing/${scriptId}` : "/dev",
      enabled: !!scriptId,
      active: pathname.startsWith("/dev/editing/"),
    },
    {
      id: "media",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      ),
      label: t("dev.nav.media"),
      href: scriptId ? `/dev/media/${scriptId}` : "/dev",
      enabled: !!scriptId,
      active: pathname.startsWith("/dev/media/"),
    },
    {
      id: "finishing",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
      ),
      label: t("dev.nav.finishing"),
      href: scriptId ? `/dev/finishing/${scriptId}` : "/dev",
      enabled: !!scriptId,
      active: pathname.startsWith("/dev/finishing/"),
    },
  ]

  return (
    <nav
      className="flex flex-col items-center py-2"
      style={{ background: "#1A1A1D", borderRight: "1px solid #0D0D0F" }}
    >
      {navItems.map((item) => (
        <div key={item.id} className="relative group">
          {item.enabled ? (
            <Link
              href={item.href}
              className="relative flex flex-col items-center justify-center w-14 h-12 transition-all"
              style={{ color: item.active ? "#E8E8EA" : "#6C6C72" }}
            >
              {item.active && (
                <div className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-r" style={{ background: "#5B8DEF" }} />
              )}
              {item.active && (
                <div className="absolute inset-0" style={{ background: "rgba(91,141,239,0.07)" }} />
              )}
              {item.icon}
              <span className="text-[9px] mt-0.5 font-medium tracking-wide">{item.label}</span>
            </Link>
          ) : (
            <div className="relative">
              <button
                onClick={() => openPicker(item.id)}
                className="relative flex flex-col items-center justify-center w-14 h-12 cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: pickerModule === item.id ? "#8888CC" : "#3A3A40" }}
              >
                {item.icon}
                <span className="text-[9px] mt-0.5 font-medium tracking-wide">{item.label}</span>
              </button>
              {/* Project picker popover */}
              {pickerModule === item.id && (
                <div
                  ref={pickerRef}
                  className="absolute left-full top-0 ml-1 w-48 rounded-lg shadow-xl overflow-hidden z-50"
                  style={{ background: "#2C2C30", border: "1px solid #3A3A3E" }}
                >
                  <div className="px-3 py-2" style={{ borderBottom: "1px solid #3A3A3E" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#777" }}>
                      {t("dev.nav.recentProjects")}
                    </p>
                  </div>
                  {recentProjects.length === 0 ? (
                    <div className="px-3 py-4 text-center">
                      <p className="text-[11px]" style={{ color: "#666" }}>{t("dev.nav.noProjects")}</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {recentProjects.map((proj) => (
                        <button
                          key={proj.id}
                          onClick={() => selectProject(item.id, proj.id)}
                          className="w-full text-left px-3 py-2 text-[11px] truncate hover:bg-white/5 transition-colors"
                          style={{ color: "#CCC" }}
                        >
                          {proj.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Bottom: Settings */}
      <div className="mt-auto">
        <button
          onClick={() => setShowSettings(true)}
          className="relative flex flex-col items-center justify-center w-14 h-12 transition-all hover:opacity-90"
          style={{ color: showSettings ? "#E8E8EA" : "#5A5A62" }}
        >
          {showSettings && (
            <div className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-r" style={{ background: "#5B8DEF" }} />
          )}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="text-[9px] mt-0.5 font-medium tracking-wide">{t("dev.nav.settings")}</span>
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </nav>
  )
}
