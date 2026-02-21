"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, CheckCircle } from "@/components/icons"
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
  { id: "animation", label: "studio.animation" },
  { id: "stageplay", label: "studio.stageplay" },
]

const STEPS = [
  { num: 1, label: "studio.stepBasicInfo" },
  { num: 2, label: "studio.stepStory" },
  { num: 3, label: "studio.stepSettings" },
  { num: 4, label: "studio.stepCreate" },
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
  const [currentStep, setCurrentStep] = useState(1)

  // Compute which steps are complete
  const stepComplete = (n: number) => {
    if (n === 1) return title.trim().length > 0 && genre.length > 0 && format.length > 0
    if (n === 2) return logline.trim().length > 0 || synopsis.trim().length > 0
    if (n === 3) return targetEpisodes > 0
    return false
  }

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
    <div className="p-4 space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/studio">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">{t("studio.newScript")}</h1>
      </div>

      {/* Step indicator bar */}
      <div className="flex items-center justify-between px-2">
        {STEPS.map((step, i) => (
          <div key={step.num} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => setCurrentStep(step.num)}
              className="flex flex-col items-center gap-1 group"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                stepComplete(step.num)
                  ? "bg-green-500 text-white"
                  : currentStep === step.num
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
              }`}>
                {stepComplete(step.num) ? <CheckCircle className="w-4 h-4" /> : step.num}
              </div>
              <span className={`text-[10px] font-medium transition-colors ${
                currentStep === step.num ? "text-primary" : "text-muted-foreground"
              }`}>
                {t(step.label)}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 mt-[-14px] ${
                stepComplete(step.num) ? "bg-green-400" : "bg-muted-foreground/20"
              }`} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Step 1: Basic Info — Title + Genre + Format */}
        {currentStep === 1 && (
          <>
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
              <div className="flex gap-2 flex-wrap">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
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

            <Button
              type="button"
              onClick={() => setCurrentStep(2)}
              disabled={!title.trim()}
              className="w-full h-11"
            >
              {t("common.next")} →
            </Button>
          </>
        )}

        {/* Step 2: Story — Logline + Synopsis */}
        {currentStep === 2 && (
          <>
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
                rows={5}
                className="w-full px-4 py-2.5 rounded-lg bg-muted border-0 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="flex-1 h-11"
              >
                ← {t("common.back")}
              </Button>
              <Button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="flex-1 h-11"
              >
                {t("common.next")} →
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Settings — Episodes */}
        {currentStep === 3 && (
          <>
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

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(2)}
                className="flex-1 h-11"
              >
                ← {t("common.back")}
              </Button>
              <Button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="flex-1 h-11"
              >
                {t("common.next")} →
              </Button>
            </div>
          </>
        )}

        {/* Step 4: Review & Create */}
        {currentStep === 4 && (
          <>
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("studio.scriptTitle")}</span>
                  <span className="text-sm font-medium">{title || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("studio.scriptGenre")}</span>
                  <span className="text-sm">{t(`discover.${genre === "scifi" ? "fantasy" : genre}`)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("studio.scriptFormat")}</span>
                  <span className="text-sm">{t(`studio.${format}`)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("studio.targetEpisodes")}</span>
                  <span className="text-sm">{targetEpisodes}</span>
                </div>
                {logline && (
                  <div className="pt-1 border-t">
                    <span className="text-xs text-muted-foreground">{t("studio.logline")}</span>
                    <p className="text-sm mt-0.5">{logline}</p>
                  </div>
                )}
                {synopsis && (
                  <div className="pt-1 border-t">
                    <span className="text-xs text-muted-foreground">{t("studio.synopsis")}</span>
                    <p className="text-sm mt-0.5 line-clamp-3">{synopsis}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(3)}
                className="flex-1 h-11"
              >
                ← {t("common.back")}
              </Button>
              <Button
                type="submit"
                disabled={!title.trim() || isSubmitting}
                className="flex-1 h-12 text-base font-semibold"
              >
                {isSubmitting ? t("common.processing") : t("common.create")}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
