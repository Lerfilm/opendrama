import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"
import { cookies } from "next/headers"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const balance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id },
  })

  // Check dev mode cookie
  const cookieStore = await cookies()
  const devModeOn = cookieStore.get("devMode")?.value === "1"

  return NextResponse.json({
    balance: balance?.balance ?? 0,
    reserved: balance?.reserved ?? 0,
    available: (balance?.balance ?? 0) - (balance?.reserved ?? 0),
    totalPurchased: balance?.totalPurchased ?? 0,
    totalConsumed: balance?.totalConsumed ?? 0,
    userName: session.user.name,
    userImage: session.user.image,
    isAdmin: isAdmin(session.user.email),
    isDevMode: devModeOn,
  })
}
