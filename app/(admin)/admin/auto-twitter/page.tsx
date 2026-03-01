"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

interface TweetMeta {
  author: string
  text: string
  tweetId: string
  tweetUrl: string
  thumbnailUrl: string | null
}

interface AnalysisResult {
  title: string
  description: string
  genre: string
  tags: string[]
  suggestedPosterPrompt: string
}

interface AnalyzeResponse {
  videoUrl: string
  durationSec: number
  frames: string[]
  analysis: AnalysisResult
  tweetMeta: TweetMeta
}

interface ImportResult {
  seriesId: string
  episodeId: string
  muxPlaybackId: string
  coverUrl: string | null
}

type Step = "input" | "analyzing" | "review" | "importing" | "done" | "error"

const GENRES = [
  "romance", "action", "comedy", "drama", "fantasy",
  "thriller", "horror", "mystery", "documentary",
]

export default function AutoTwitterPage() {
  const [step, setStep] = useState<Step>("input")
  const [tweetUrl, setTweetUrl] = useState("")
  const [error, setError] = useState("")

  // Analysis state
  const [analyzeData, setAnalyzeData] = useState<AnalyzeResponse | null>(null)

  // Editable fields
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [genre, setGenre] = useState("drama")
  const [tags, setTags] = useState<string[]>([])
  const [posterPrompt, setPosterPrompt] = useState("")
  const [generatePoster, setGeneratePoster] = useState(true)

  // Import result
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importStatus, setImportStatus] = useState("")

  async function handleAnalyze() {
    if (!tweetUrl.trim()) return
    setStep("analyzing")
    setError("")

    try {
      const res = await fetch("/api/auto-twitter/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetUrl: tweetUrl.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data: AnalyzeResponse = await res.json()
      setAnalyzeData(data)

      // Pre-fill editable fields
      setTitle(data.analysis.title)
      setDescription(data.analysis.description)
      setGenre(data.analysis.genre)
      setTags(data.analysis.tags)
      setPosterPrompt(data.analysis.suggestedPosterPrompt)

      setStep("review")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setStep("error")
    }
  }

  async function handleImport() {
    if (!analyzeData) return
    setStep("importing")
    setImportStatus(t("admin.twitter.generatingPoster"))

    try {
      const res = await fetch("/api/auto-twitter/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: analyzeData.videoUrl,
          title,
          description,
          genre,
          tags,
          posterPrompt: generatePoster ? posterPrompt : undefined,
          durationSec: analyzeData.durationSec,
          tweetUrl: analyzeData.tweetMeta.tweetUrl,
          tweetAuthor: analyzeData.tweetMeta.author,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const result: ImportResult = await res.json()
      setImportResult(result)
      setStep("done")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setStep("error")
    }
  }

  function handleReset() {
    setStep("input")
    setTweetUrl("")
    setError("")
    setAnalyzeData(null)
    setTitle("")
    setDescription("")
    setGenre("drama")
    setTags([])
    setPosterPrompt("")
    setGeneratePoster(true)
    setImportResult(null)
    setImportStatus("")
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t("admin.twitter.title")}</h1>
        <p className="text-muted-foreground">
          {t("admin.twitter.desc")}
        </p>
      </div>

      {/* Step 1: Input */}
      {(step === "input" || step === "analyzing" || step === "error") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("admin.twitter.step1")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <input
                type="url"
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder={t("admin.twitter.urlPlaceholder")}
                className="flex-1 h-10 px-3 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={step === "analyzing"}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              />
              <Button
                onClick={handleAnalyze}
                disabled={step === "analyzing" || !tweetUrl.trim()}
              >
                {step === "analyzing" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("admin.twitter.analyzing")}
                  </>
                ) : (
                  t("admin.twitter.analyze")
                )}
              </Button>
            </div>

            {step === "analyzing" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("admin.twitter.analyzingDesc")}
              </div>
            )}

            {step === "error" && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review */}
      {(step === "review" || step === "importing") && analyzeData && (
        <>
          {/* Extracted Frames */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("admin.twitter.step2", { sec: analyzeData.durationSec })}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {analyzeData.frames.map((frame, i) => (
                  <div key={i} className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    <img
                      src={frame}
                      alt={t("admin.twitter.frame", { n: i + 1 })}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                      F{i + 1}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Source: @{analyzeData.tweetMeta.author} — {analyzeData.tweetMeta.text.slice(0, 100)}
              </p>
            </CardContent>
          </Card>

          {/* Editable Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("admin.twitter.step3")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{t("admin.twitter.labelTitle")}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={step === "importing"}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">{t("admin.twitter.labelDesc")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  disabled={step === "importing"}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.twitter.labelGenre")}</label>
                  <select
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={step === "importing"}
                  >
                    {GENRES.map((g) => (
                      <option key={g} value={g}>
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.twitter.labelTags")}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag}
                        <button
                          onClick={() => setTags(tags.filter((_, j) => j !== i))}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          disabled={step === "importing"}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="generatePoster"
                    checked={generatePoster}
                    onChange={(e) => setGeneratePoster(e.target.checked)}
                    disabled={step === "importing"}
                  />
                  <label htmlFor="generatePoster" className="text-sm font-medium">
                    {t("admin.twitter.generatePoster")}
                  </label>
                </div>
                {generatePoster && (
                  <textarea
                    value={posterPrompt}
                    onChange={(e) => setPosterPrompt(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder={t("admin.twitter.posterPromptPlaceholder")}
                    disabled={step === "importing"}
                  />
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleImport}
                  disabled={step === "importing" || !title.trim()}
                  className="flex-1"
                >
                  {step === "importing" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("admin.twitter.importing")}
                    </>
                  ) : (
                    t("admin.twitter.importBtn")
                  )}
                </Button>
                <Button variant="outline" onClick={handleReset} disabled={step === "importing"}>
                  {t("common.cancel")}
                </Button>
              </div>

              {step === "importing" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {importStatus || t("common.processing")}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Step 3: Done */}
      {step === "done" && importResult && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-bold">{t("admin.twitter.importComplete")}</h2>
            <p className="text-muted-foreground">
              {t("admin.twitter.seriesCreated", { title })}
            </p>

            {importResult.coverUrl && (
              <div className="mx-auto w-32 aspect-[9/16] rounded-lg overflow-hidden bg-muted">
                <img src={importResult.coverUrl} alt={t("admin.twitter.posterAlt")} className="w-full h-full object-cover" />
              </div>
            )}

            <div className="flex justify-center gap-3">
              <Link href={`/series/${importResult.seriesId}`}>
                <Button>{t("admin.twitter.viewSeries")}</Button>
              </Link>
              <Button variant="outline" onClick={handleReset}>
                {t("admin.twitter.importAnother")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state (for import errors) */}
      {step === "error" && analyzeData && (
        <Card className="border-destructive">
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-4xl">❌</div>
            <h2 className="text-xl font-bold">{t("admin.twitter.importFailed")}</h2>
            <p className="text-destructive text-sm">{error}</p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => setStep("review")}>
                {t("admin.twitter.tryAgain")}
              </Button>
              <Button variant="outline" onClick={handleReset}>
                {t("admin.twitter.startOver")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
