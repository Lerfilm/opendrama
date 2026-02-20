"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

const GENRES = [
  { id: "drama", label: "discover.drama" },
  { id: "comedy", label: "discover.comedy" },
  { id: "romance", label: "discover.romance" },
  { id: "thriller", label: "discover.thriller" },
  { id: "fantasy", label: "discover.fantasy" },
]

const FORMATS = [
  { id: "shortdrama", label: "studio.shortdrama" },
  { id: "movie", label: "studio.movie" },
  { id: "stageplay", label: "studio.stageplay" },
]

export default function NewScriptPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [genre, setGenre] = useState("drama")
  const [format, setFormat] = useState("shortdrama")
  const [targetEpisodes, setTargetEpisodes] = useState(10)
  const [logline, setLogline] = useState("")
  const [synopsis, setSynopsis] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          genre,
          format,
          targetEpisodes,
          logline: logline.trim() || undefined,
          synopsis: synopsis.trim() || undefined,
        }),
      })

      if (!res.ok) throw new Error("Failed")

      const data = await res.json()
      router.push(`/studio/script/${data.script.id}`)
    } catch {
      alert(t("common.processing"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/studio">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">{t("studio.newScript")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 标题 */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("studio.scriptTitle")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("studio.scriptTitle")}
            required
            className="w-full px-4 py-2.5 rounded-lg bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* 类型 */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("studio.scriptGenre")}</label>
          <div className="flex gap-2 flex-wrap">
            {GENRES.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGenre(g.id)}
                className={`px-4 py-2 rounded-full text-sm transition-all ${
                  genre === g.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t(g.label)}
              </button>
            ))}
          </div>
        </div>

        {/* 格式 */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("studio.scriptFormat")}</label>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  format === f.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
        </div>

        {/* 目标集数 */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            {t("studio.targetEpisodes")}: {targetEpisodes}
          </label>
          <input
            type="range"
            min={1}
            max={50}
            value={targetEpisodes}
            onChange={(e) => setTargetEpisodes(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1</span>
            <span>50</span>
          </div>
        </div>

        {/* 一句话概要 */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("studio.logline")}</label>
          <input
            type="text"
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            placeholder={t("studio.logline")}
            className="w-full px-4 py-2.5 rounded-lg bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* 剧情概要 */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("studio.synopsis")}</label>
          <textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder={t("studio.synopsis")}
            rows={4}
            className="w-full px-4 py-2.5 rounded-lg bg-muted border-0 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* 提交 */}
        <Button
          type="submit"
          disabled={!title.trim() || isSubmitting}
          className="w-full h-12 text-base font-semibold"
        >
          {isSubmitting ? t("common.processing") : t("common.create")}
        </Button>
      </form>
    </div>
  )
}
