export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/feedback — submit feedback (authenticated or anonymous)
 * Body: { category: "general"|"bug"|"feature", content: string, page?: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth()

  const { category, content, page } = (await req.json()) as {
    category?: string
    content?: string
    page?: string
  }

  if (!content || content.trim().length < 2) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 })
  }

  if (content.length > 5000) {
    return NextResponse.json({ error: "Content too long (max 5000 chars)" }, { status: 400 })
  }

  const validCategories = ["general", "bug", "feature"]
  const cat = validCategories.includes(category || "") ? category! : "general"

  const feedback = await prisma.feedback.create({
    data: {
      userId: session?.user?.id || null,
      email: session?.user?.email || null,
      category: cat,
      content: content.trim(),
      page: page || null,
    },
  })

  return NextResponse.json({ success: true, id: feedback.id })
}
