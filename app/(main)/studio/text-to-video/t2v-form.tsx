"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sparkles, ImageIcon, Loader2, Coins } from "@/components/icons"
import { t } from "@/lib/i18n"

const STYLES = [
  { id: "auto", label: "t2v.styleAuto", color: "from-gray-400 to-gray-600" },
  { id: "realistic", label: "t2v.styleRealistic", color: "from-blue-400 to-blue-600" },
  { id: "anime", label: "t2v.styleAnime", color: "from-pink-400 to-purple-600" },
  { id: "3d", label: "t2v.style3d", color: "from-green-400 to-teal-600" },
  { id: "cinematic", label: "t2v.styleCinematic", color: "from-amber-400 to-orange-600" },
]

const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9", desc: "横屏" },
  { id: "9:16", label: "9:16", desc: "竖屏" },
  { id: "1:1", label: "1:1", desc: "方形" },
  { id: "4:3", label: "4:3", desc: "经典" },
]

const DURATIONS = [
  { id: 3, label: "3s" },
  { id: 5, label: "5s" },
  { id: 10, label: "10s" },
]

const COST_PER_VIDEO = 10 // 每次生成消耗金币

export function TextToVideoForm({ userCoins }: { userCoins: number }) {
  const [prompt, setPrompt] = useState("")
  const [negativePrompt, setNegativePrompt] = useState("")
  const [style, setStyle] = useState("auto")
  const [aspectRatio, setAspectRatio] = useState("9:16")
  const [duration, setDuration] = useState(5)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  async function handleGenerate() {
    if (!prompt.trim() || isGenerating) return
    setIsGenerating(true)

    try {
      const res = await fetch("/api/ai/text-to-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          style,
          aspectRatio,
          duration,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || t("common.processing"))
        return
      }

      // 刷新页面查看结果
      window.location.reload()
    } catch {
      alert(t("common.processing"))
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 提示词输入 - 即梦风格大文本框 */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("t2v.promptPlaceholder")}
            rows={4}
            className="w-full p-4 bg-transparent border-0 resize-none text-sm focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {prompt.length} / 500
            </span>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-primary hover:underline"
            >
              {showAdvanced ? t("common.close") : t("t2v.negativePrompt")}
            </button>
          </div>
          {showAdvanced && (
            <div className="px-4 pb-3 border-t border-border">
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder={t("t2v.negativePromptPlaceholder")}
                rows={2}
                className="w-full mt-2 p-2 rounded-lg bg-muted text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/60"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 风格选择 - 即梦风格横向滚动卡片 */}
      <div>
        <h3 className="text-sm font-medium mb-2">{t("t2v.style")}</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`flex-shrink-0 relative w-20 h-20 rounded-xl overflow-hidden transition-all ${
                style === s.id
                  ? "ring-2 ring-primary ring-offset-2 scale-105"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <div
                className={`w-full h-full bg-gradient-to-br ${s.color} flex items-center justify-center`}
              >
                <span className="text-white text-xs font-medium">{t(s.label)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 比例 + 时长 - 即梦风格按钮组 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium mb-2">{t("t2v.aspectRatio")}</h3>
          <div className="grid grid-cols-2 gap-2">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar.id}
                onClick={() => setAspectRatio(ar.id)}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                  aspectRatio === ar.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <div>{ar.label}</div>
                <div className="text-[10px] opacity-70">{ar.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">{t("t2v.duration")}</h3>
          <div className="space-y-2">
            {DURATIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDuration(d.id)}
                className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  duration === d.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t("t2v.seconds", { n: d.id })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 参考图上传 */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <button className="w-full flex items-center gap-3 text-left">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("t2v.referenceImage")}</p>
              <p className="text-xs text-muted-foreground">{t("t2v.uploadRef")}</p>
            </div>
          </button>
        </CardContent>
      </Card>

      {/* 生成按钮 - 即梦风格渐变大按钮 */}
      <div className="space-y-2">
        <Button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating || userCoins < COST_PER_VIDEO}
          className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold text-base rounded-xl"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {t("t2v.generating")}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              {t("t2v.generate")}
            </>
          )}
        </Button>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Coins className="w-3.5 h-3.5" />
            {t("t2v.cost", { coins: COST_PER_VIDEO })}
          </span>
          <span>{t("t2v.estimatedTime", { min: duration <= 5 ? 2 : 5 })}</span>
        </div>
        {userCoins < COST_PER_VIDEO && (
          <p className="text-xs text-destructive text-center">
            {t("episode.insufficientCoins")}
          </p>
        )}
      </div>
    </div>
  )
}
