import zh from "./zh"
import en from "./en"

export type Locale = "zh" | "en"

const translations: Record<Locale, Record<string, string>> = { zh, en }

/**
 * Get locale synchronously.
 * Server-side: defaults to "en" (use getLocaleAsync for cookie-based).
 * Client-side: reads from cookie or navigator.
 */
export function getLocale(): Locale {
  if (typeof window === "undefined") {
    // Server-side: can't call cookies() synchronously in Next.js 15+
    // Default to en; pages can use getLocaleAsync() if needed
    return "en"
  }

  // Client-side: read from cookie, then navigator
  const match = document.cookie.match(/(?:^|;\s*)locale=(\w+)/)
  if (match) {
    return match[1] === "zh" ? "zh" : "en"
  }

  if (navigator.language.startsWith("zh")) return "zh"
  return "en"
}

/**
 * Async locale getter for server components.
 */
export async function getLocaleAsync(): Promise<Locale> {
  if (typeof window === "undefined") {
    try {
      const { cookies } = await import("next/headers")
      const cookieStore = await cookies()
      const locale = cookieStore.get("locale")?.value
      if (locale === "zh") return "zh"
    } catch {
      // fallback
    }
  }
  return "en"
}

/**
 * Translate a key with optional interpolation.
 * Usage: t("home.greeting", { name: "Alice" })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = getLocale()
  let text = translations[locale]?.[key] || translations.en[key] || key

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
    let text = translations[locale]?.[key] || translations.en[key] || key
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
