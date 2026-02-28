"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { t } from "@/lib/i18n"

export function MobileRedirect() {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check viewport width (mobile < 768px)
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  if (!isMobile || dismissed) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-indigo-600">
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
            <line x1="12" x2="12.01" y1="18" y2="18" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-2">
          {t("dev.mobile.title")}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {t("dev.mobile.desc")}
        </p>

        <div className="space-y-3">
          <button
            onClick={() => router.push("/studio")}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #4F46E5, #7C3AED)" }}
          >
            {t("dev.mobile.openStudio")}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {t("dev.mobile.continueAnyway")}
          </button>
        </div>
      </div>
    </div>
  )
}
