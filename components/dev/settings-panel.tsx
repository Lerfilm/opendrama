"use client"

import { useState, useEffect } from "react"
import { setLocale, getLocale, type Locale } from "@/lib/i18n"

interface SettingsPanelProps {
  onClose: () => void
}

const KEYBOARD_SHORTCUTS = [
  { keys: ["⌘", "K"], description: "Command palette / search" },
  { keys: ["⌘", "S"], description: "Save current scene" },
  { keys: ["⌘", "Z"], description: "Undo" },
  { keys: ["⌘", "⇧", "Z"], description: "Redo" },
  { keys: ["⌘", "↑"], description: "Previous scene" },
  { keys: ["⌘", "↓"], description: "Next scene" },
  { keys: ["⌘", "↵"], description: "Generate / confirm" },
  { keys: ["Esc"], description: "Close panel / cancel" },
]

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<"general" | "shortcuts">("general")
  const [language, setLanguage] = useState<Locale>("en")
  const [autosaveInterval, setAutosaveInterval] = useState("30")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLanguage(getLocale())
    const stored = localStorage.getItem("dev:autosaveInterval")
    if (stored) setAutosaveInterval(stored)
  }, [])

  function handleSave() {
    setLocale(language)
    localStorage.setItem("dev:autosaveInterval", autosaveInterval)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    // Reload to apply locale change
    if (getLocale() !== language) {
      setTimeout(() => window.location.reload(), 400)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[190]"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed left-14 top-0 bottom-0 z-[195] flex flex-col"
        style={{
          width: 340,
          background: "#1E1E20",
          borderRight: "1px solid #2A2A2E",
          boxShadow: "4px 0 24px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid #2A2A2E" }}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: "#818CF8" }}>
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="text-[13px] font-semibold" style={{ color: "#F0F0F0" }}>Settings</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-white/10"
            style={{ color: "#888" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab pills */}
        <div className="flex gap-1 px-4 py-2 flex-shrink-0" style={{ borderBottom: "1px solid #2A2A2E" }}>
          {(["general", "shortcuts"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-3 py-1 rounded text-[11px] font-medium capitalize transition-colors"
              style={{
                background: activeTab === tab ? "rgba(99,102,241,0.25)" : "transparent",
                color: activeTab === tab ? "#A5B4FC" : "#888",
                border: activeTab === tab ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent",
              }}
            >
              {tab === "general" ? "General" : "Shortcuts"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto dev-scrollbar p-4">
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* Language */}
              <div>
                <label className="block text-[11px] font-medium mb-2" style={{ color: "#A0A0A8" }}>
                  Interface Language
                </label>
                <div className="flex gap-2">
                  {(["en", "zh"] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className="flex-1 py-2 rounded-lg text-[12px] font-medium transition-all"
                      style={{
                        background: language === lang ? "rgba(99,102,241,0.25)" : "#2A2A2E",
                        border: language === lang ? "1px solid rgba(99,102,241,0.5)" : "1px solid #3A3A3E",
                        color: language === lang ? "#A5B4FC" : "#888",
                      }}
                    >
                      {lang === "en" ? "🇺🇸  English" : "🇨🇳  中文"}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px]" style={{ color: "#555" }}>Applies on save. Page will reload.</p>
              </div>

              {/* Autosave interval */}
              <div>
                <label className="block text-[11px] font-medium mb-2" style={{ color: "#A0A0A8" }}>
                  Autosave Interval
                </label>
                <div className="flex gap-2">
                  {[
                    { value: "10", label: "10s" },
                    { value: "30", label: "30s" },
                    { value: "60", label: "1 min" },
                    { value: "300", label: "5 min" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAutosaveInterval(opt.value)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                      style={{
                        background: autosaveInterval === opt.value ? "rgba(99,102,241,0.25)" : "#2A2A2E",
                        border: autosaveInterval === opt.value ? "1px solid rgba(99,102,241,0.5)" : "1px solid #3A3A3E",
                        color: autosaveInterval === opt.value ? "#A5B4FC" : "#888",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px]" style={{ color: "#555" }}>Auto-saves unsaved scene changes.</p>
              </div>

              {/* Theme (placeholder) */}
              <div>
                <label className="block text-[11px] font-medium mb-2" style={{ color: "#A0A0A8" }}>
                  Theme
                </label>
                <div className="flex gap-2">
                  <button
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-medium"
                    style={{ background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)", color: "#A5B4FC" }}
                  >
                    Dark
                  </button>
                  <button
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-medium cursor-not-allowed"
                    style={{ background: "#2A2A2E", border: "1px solid #3A3A3E", color: "#555" }}
                    title="Coming soon"
                  >
                    Light
                  </button>
                  <button
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-medium cursor-not-allowed"
                    style={{ background: "#2A2A2E", border: "1px solid #3A3A3E", color: "#555" }}
                    title="Coming soon"
                  >
                    System
                  </button>
                </div>
              </div>

              {/* Development Team */}
              <div>
                <label className="block text-[11px] font-medium mb-2" style={{ color: "#A0A0A8" }}>
                  Development Team
                </label>
                <div className="rounded-lg overflow-hidden" style={{ background: "#2A2A2E", border: "1px solid #3A3A3E" }}>
                  {[
                    { role: "Lead Developer", name: "Jeff Lee, MPSE" },
                    { role: "System Architect", name: "Nancy" },
                    { role: "UI Designer", name: "Joey" },
                    { role: "Software Engineer", name: "Mia" },
                  ].map((member, i) => (
                    <div
                      key={member.name}
                      className="flex items-center justify-between px-3 py-2"
                      style={{ borderTop: i > 0 ? "1px solid #3A3A3E" : undefined }}
                    >
                      <span className="text-[11px]" style={{ color: "#888" }}>{member.role}</span>
                      <span className="text-[11px] font-medium" style={{ color: "#D0D0D0" }}>{member.name}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px]" style={{ color: "#555" }}>OpenDrama v1.0.0</p>
              </div>
            </div>
          )}

          {activeTab === "shortcuts" && (
            <div>
              <p className="text-[11px] mb-4" style={{ color: "#666" }}>
                Keyboard shortcuts available in the dev workspace.
              </p>
              <div className="space-y-1">
                {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 px-3 rounded"
                    style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}
                  >
                    <span className="text-[11px]" style={{ color: "#B0B0B0" }}>
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {shortcut.keys.map((key, ki) => (
                        <kbd
                          key={ki}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                          style={{
                            background: "#2A2A2E",
                            border: "1px solid #404040",
                            color: "#A5B4FC",
                            minWidth: 20,
                            textAlign: "center",
                          }}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === "general" && (
          <div
            className="flex items-center justify-end gap-2 px-4 py-3 flex-shrink-0"
            style={{ borderTop: "1px solid #2A2A2E" }}
          >
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded text-[12px] font-medium transition-colors"
              style={{ color: "#888", background: "#2A2A2E", border: "1px solid #3A3A3E" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded text-[12px] font-medium transition-all"
              style={{
                background: saved ? "rgba(16,185,129,0.25)" : "rgba(99,102,241,0.3)",
                border: saved ? "1px solid rgba(16,185,129,0.5)" : "1px solid rgba(99,102,241,0.5)",
                color: saved ? "#6EE7B7" : "#A5B4FC",
              }}
            >
              {saved ? "Saved ✓" : "Save Settings"}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
