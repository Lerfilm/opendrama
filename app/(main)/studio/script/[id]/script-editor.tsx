"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Sparkles, Trash2, Loader2 } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

interface Script {
  id: string
  title: string
  genre: string
  format: string
  logline: string | null
  synopsis: string | null
  targetEpisodes: number
  status: string
  scenes: Scene[]
  roles: Role[]
}

interface Scene {
  id: string
  episodeNum: number
  sceneNum: number
  heading: string | null
  action: string | null
  dialogue: string | null
  stageDirection: string | null
}

interface Role {
  id: string
  name: string
  role: string
  description: string | null
}

export function ScriptEditor({ script: initial }: { script: Script }) {
  const [script, setScript] = useState(initial)
  const [activeTab, setActiveTab] = useState<"scenes" | "roles">("scenes")
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedEpisode, setSelectedEpisode] = useState(1)

  // 按集数分组场景
  const episodeMap: Record<number, Scene[]> = {}
  for (const scene of script.scenes) {
    if (!episodeMap[scene.episodeNum]) episodeMap[scene.episodeNum] = []
    episodeMap[scene.episodeNum].push(scene)
  }
  const episodes = Object.keys(episodeMap)
    .map(Number)
    .sort((a, b) => a - b)

  async function handleAIGenerate() {
    if (isGenerating) return
    setIsGenerating(true)

    try {
      const res = await fetch("/api/ai/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id }),
      })

      if (!res.ok) throw new Error("Failed")

      // 重新加载剧本数据
      const scriptRes = await fetch(`/api/scripts/${script.id}`)
      if (scriptRes.ok) {
        const data = await scriptRes.json()
        setScript(data.script)
      }
    } catch {
      alert(t("common.processing"))
    } finally {
      setIsGenerating(false)
    }
  }

  const roleColors: Record<string, string> = {
    protagonist: "bg-blue-100 text-blue-700",
    antagonist: "bg-red-100 text-red-700",
    supporting: "bg-green-100 text-green-700",
    minor: "bg-gray-100 text-gray-700",
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <Link href="/studio">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{script.title}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{t(`studio.${script.status}`)}</Badge>
            <span>{t(`discover.${script.genre}`)}</span>
            <span>{t("studio.episode", { num: script.targetEpisodes })}</span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleAIGenerate}
          disabled={isGenerating}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-1" />
          )}
          {isGenerating ? t("studio.generating") : t("studio.generateScript")}
        </Button>
      </div>

      {/* 概要卡片 */}
      {(script.logline || script.synopsis) && (
        <Card>
          <CardContent className="p-3">
            {script.logline && (
              <p className="text-sm font-medium mb-1">{script.logline}</p>
            )}
            {script.synopsis && (
              <p className="text-xs text-muted-foreground line-clamp-3">{script.synopsis}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 场景/角色切换 */}
      <div className="flex border-b border-border">
        {(["scenes", "roles"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {t(`studio.${tab}`)} ({tab === "scenes" ? script.scenes.length : script.roles.length})
          </button>
        ))}
      </div>

      {/* 场景列表 */}
      {activeTab === "scenes" && (
        <div className="space-y-3">
          {/* 集数选择 */}
          {episodes.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {episodes.map((ep) => (
                <button
                  key={ep}
                  onClick={() => setSelectedEpisode(ep)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedEpisode === ep
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t("studio.episode", { num: ep })}
                </button>
              ))}
            </div>
          )}

          {/* 场景内容 */}
          {(episodeMap[selectedEpisode] || []).map((scene) => (
            <Card key={scene.id}>
              <CardContent className="p-3 space-y-2">
                {scene.heading && (
                  <p className="text-xs font-mono font-bold text-primary uppercase">
                    {scene.heading}
                  </p>
                )}
                {scene.action && (
                  <p className="text-sm">{scene.action}</p>
                )}
                {scene.dialogue && (
                  <div className="space-y-1">
                    {JSON.parse(scene.dialogue).map(
                      (line: { character: string; line: string; direction?: string }, i: number) => (
                        <div key={i} className="pl-4 border-l-2 border-primary/30">
                          <p className="text-xs font-bold uppercase text-primary">
                            {line.character}
                          </p>
                          {line.direction && (
                            <p className="text-xs text-muted-foreground italic">
                              ({line.direction})
                            </p>
                          )}
                          <p className="text-sm">{line.line}</p>
                        </div>
                      )
                    )}
                  </div>
                )}
                {scene.stageDirection && (
                  <p className="text-xs italic text-muted-foreground">
                    {scene.stageDirection}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {script.scenes.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p className="mb-2">{t("studio.noScripts")}</p>
                <Button size="sm" onClick={handleAIGenerate} disabled={isGenerating}>
                  <Sparkles className="w-4 h-4 mr-1" />
                  {t("studio.generateScript")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 角色列表 */}
      {activeTab === "roles" && (
        <div className="space-y-3">
          {script.roles.map((role) => (
            <Card key={role.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{role.name}</span>
                  <Badge
                    variant="secondary"
                    className={roleColors[role.role] || ""}
                  >
                    {role.role}
                  </Badge>
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                )}
              </CardContent>
            </Card>
          ))}

          {script.roles.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>{t("studio.noScripts")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
