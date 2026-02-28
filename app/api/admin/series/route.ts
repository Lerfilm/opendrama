export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/admin"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const seriesList = await prisma.series.findMany({
      include: {
        _count: {
          select: { episodes: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ series: seriesList })
  } catch (error) {
    console.error("Failed to fetch series:", error)
    return NextResponse.json(
      { error: "Failed to fetch series" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { title, description, coverUrl, status } = await req.json()

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      )
    }

    const series = await prisma.series.create({
      data: {
        title,
        description: description || null,
        coverUrl: coverUrl || null,
        status: status || "active",
      },
    })

    return NextResponse.json({ series })
  } catch (error) {
    console.error("Failed to create series:", error)
    return NextResponse.json(
      { error: "Failed to create series" },
      { status: 500 }
    )
  }
}
