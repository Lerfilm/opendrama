import zh from "./zh"
import en from "./en"

export type Locale = "zh" | "en"

const translations: Record<Locale, Record<string, string>> = { zh, en }

/**
 * Get locale synchronously.
 * Server-side: reads x-locale header set by middleware (via async getLocaleFromHeaders).
 * Client-side: reads from cookie or navigator.
 */
export function getLocale(): Locale {
  if (typeof window === "undefined") {
    // Server-side synchronous: no reliable way to read cookies/headers synchronously in Next.js 15+
    // Pages should use getLocaleAsync() for accurate results
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
 * Async locale getter — works in server components and route handlers.
 * Reads the x-locale header injected by middleware (fastest)
 * or falls back to reading the locale cookie directly.
 */
export async function getLocaleAsync(): Promise<Locale> {
  if (typeof window === "undefined") {
    try {
      const { headers } = await import("next/headers")
      const h = await headers()
      const fromHeader = h.get("x-locale")
      if (fromHeader === "zh") return "zh"
      if (fromHeader === "en") return "en"
    } catch {
      // fallback to cookies
    }
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
 * Client-side: uses getLocale() (reads cookie synchronously).
 * Server-side: defaults to "en" — use tAsync() or createT(locale) for proper server-side i18n.
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
 * Use in server components: const t = createT(await getLocaleAsync())
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
