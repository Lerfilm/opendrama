import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Middleware: injects x-locale header from the "locale" cookie
 * so server components can read locale synchronously via headers().
 */
export function middleware(request: NextRequest) {
  const locale = request.cookies.get("locale")?.value || ""
  const response = NextResponse.next()
  // Pass locale to server components via a custom request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-locale", locale || "en")
  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: [
    // Run on all routes except static assets and api
    "/((?!_next/static|_next/image|favicon.ico|icon-|manifest.json|robots.txt|sitemap.xml).*)",
  ],
}
