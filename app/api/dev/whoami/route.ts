import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 403 })
  }
  const session = await auth()
  // Also count scripts for this user
  const scriptCount = session?.user?.id
    ? await prisma.script.count({ where: { userId: session.user.id } })
    : 0
  return NextResponse.json({ session, scriptCount })
}
