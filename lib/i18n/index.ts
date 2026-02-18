import zh from "./zh"
import en from "./en"

export type Locale = "zh" | "en"

const translations: Record<Locale, Record<string, string>> = { zh, en }

/**
 * Get locale from cookies (server-side) or navigator (client-side).
 * Default: zh
 */
export function getLocale(): Locale {
  // Server-side: read from cookies
  if (typeof window === "undefined") {
    try {
      const { cookies } = require("next/headers")
      const locale = cookies().get("locale")?.value
      if (locale === "en") return "en"
    } catch {
      // fallback
    }
    return "zh"
  }

  // Client-side: read from cookie, then navigator
  const match = document.cookie.match(/(?:^|;\s*)locale=(\w+)/)
  if (match) {
    return match[1] === "en" ? "en" : "zh"
  }

  if (navigator.language.startsWith("en")) return "en"
  return "zh"
}

/**
 * Translate a key with optional interpolation.
 * Usage: t("home.greeting", { name: "Alice" })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = getLocale()
  let text = translations[locale]?.[key] || translations.zh[key] || key

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }

  return text
}

/**
 * Create a translator bound to a specific locale.
 */
export function createT(locale: Locale) {
  return function (key: string, params?: Record<string, string | number>): string {
    let text = translations[locale]?.[key] || translations.zh[key] || key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v))
      }
    }
    return text
  }
}

export function setLocale(locale: Locale) {
  document.cookie = `locale=${locale};path=/;max-age=${365 * 24 * 60 * 60}`
}
