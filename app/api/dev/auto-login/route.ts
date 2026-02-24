/**
 * DEV-ONLY: Auto-login as the first user in the database.
 * This endpoint is ONLY available when NODE_ENV === "development".
 * It creates a real session in the DB and sets the session cookie.
 */
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // Safety guard — block in production
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 })
  }

  // Find all users and their script counts for debugging
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: "asc" },
  })
  const scriptCounts = await Promise.all(
    allUsers.map(u => prisma.script.count({ where: { userId: u.id } }).then(c => ({ ...u, scriptCount: c })))
  )
  // Pick the user with the most scripts (the developer)
  const user = scriptCounts.sort((a, b) => b.scriptCount - a.scriptCount)[0] ?? null

  if (!user) {
    return NextResponse.json({ error: "No users in database" }, { status: 404 })
  }

  // If ?debug=1 is set, show info instead of redirecting
  if (req.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({ users: scriptCounts, selectedUser: user })
  }

  // Create a new session
  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  })

  // Redirect target
  const redirectTo = req.nextUrl.searchParams.get("callbackUrl") || "/dev"

  const res = NextResponse.redirect(new URL(redirectTo, req.url))

  // Set the NextAuth v5 session cookie (HTTP on localhost → no Secure prefix)
  res.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  })

  // Also enable devMode so the /dev layout passes isDevModeActive() check
  res.cookies.set("devMode", "1", {
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  })

  return res
}
