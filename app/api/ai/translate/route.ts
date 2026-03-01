export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

// Detect if text contains Chinese characters
function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rl = checkRateLimit(`ai:${session.user.id}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  try {
    const { text } = await req.json()
    if (!text || typeof text !== "string" || text.trim().length < 2) {
      return NextResponse.json({ error: "Text too short" }, { status: 400 })
    }

    // Detect language and decide target
    const isChinese = hasChinese(text)
    const targetLang = isChinese ? "English" : "Chinese (Simplified)"
    const sourceLang = isChinese ? "Chinese" : "English"

    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "system",
            content: `You are a professional translator for video production prompts. Translate the following ${sourceLang} text to ${targetLang}. Only output the translation, nothing else. Preserve any @mentions and [references] as-is. Keep the same tone and style.`,
          },
          { role: "user", content: text.slice(0, 2000) },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Translation failed" }, { status: 500 })
    }

    const data = await res.json()
    const translation = data.choices?.[0]?.message?.content?.trim() ?? ""

    return NextResponse.json({
      translation,
      sourceLang: isChinese ? "zh" : "en",
      targetLang: isChinese ? "en" : "zh",
    })
  } catch {
    return NextResponse.json({ error: "Translation failed" }, { status: 500 })
  }
}
