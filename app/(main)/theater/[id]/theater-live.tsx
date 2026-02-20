"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Users, Send } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

interface TheaterData {
  id: string
  title: string
  description: string | null
  status: string
  genre: string
  scenario: string | null
  characters: string | null
  creator: { id: string; name: string | null; image: string | null }
  sessions: SessionData[]
}

interface SessionData {
  id: string
  sessionNum: number
  title: string | null
  narrative: string | null
  status: string
  votingEndsAt: string | null
  messages: MessageData[]
  options: OptionData[]
}

interface MessageData {
  id: string
  role: string
  character: string | null
  content: string
  messageType: string
}

interface OptionData {
  id: string
  label: string
  description: string | null
  voteCount: number
  _count: { votes: number }
}

export function TheaterLive({
  theater: initialTheater,
  userId,
  userVotes: initialUserVotes,
}: {
  theater: TheaterData
  userId: string | null
  userVotes: string[]
}) {
  const [theater, setTheater] = useState(initialTheater)
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set(initialUserVotes))
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [danmaku, setDanmaku] = useState("")
  const [danmakuList, setDanmakuList] = useState<Array<{ id: string; text: string; x: number }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const statusConfig: Record<string, { label: string; className: string }> = {
    draft: { label: t("studio.draft"), className: "bg-gray-100 text-gray-700" },
    live: { label: t("theater.live"), className: "bg-red-500 text-white animate-pulse" },
    paused: { label: t("theater.paused"), className: "bg-yellow-100 text-yellow-700" },
    ended: { label: t("theater.ended"), className: "bg-gray-100 text-gray-700" },
  }

  const currentStatus = statusConfig[theater.status] || statusConfig.draft

  // 自动滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [theater.sessions])

  // 投票倒计时
  useEffect(() => {
    const lastSession = theater.sessions[theater.sessions.length - 1]
    if (!lastSession?.votingEndsAt || lastSession.status !== "voting") {
      setCountdown(null)
      return
    }

    const endTime = new Date(lastSession.votingEndsAt).getTime()

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
      setCountdown(remaining)

      if (remaining <= 0) {
        clearInterval(timer)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [theater.sessions])

  // 轮询更新（简单版实时，后续可替换为 Supabase Realtime）
  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/theaters/${theater.id}/state`)
      if (res.ok) {
        const data = await res.json()
        if (data.theater) {
          setTheater(data.theater)
        }
      }
    } catch {
      // 静默
    }
  }, [theater.id])

  useEffect(() => {
    if (theater.status === "live") {
      // 每 3 秒轮询
      pollIntervalRef.current = setInterval(fetchLatest, 3000)
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      }
    }
  }, [theater.status, fetchLatest])

  // 投票
  async function handleVote(optionId: string) {
    if (!userId || userVotes.has(optionId) || votingOptionId) return
    setVotingOptionId(optionId)

    try {
      const res = await fetch(`/api/theaters/${theater.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      })

      if (res.ok) {
        setUserVotes(new Set([...userVotes, optionId]))
        // 立即刷新
        fetchLatest()
      }
    } catch {
      // ignore
    } finally {
      setVotingOptionId(null)
    }
  }

  // 创建者推进剧情
  async function handleAdvance() {
    if (isAdvancing) return
    setIsAdvancing(true)

    try {
      const res = await fetch(`/api/theaters/${theater.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (res.ok) {
        await fetchLatest()
        // 重置投票状态
        setUserVotes(new Set())
      }
    } catch {
      // ignore
    } finally {
      setIsAdvancing(false)
    }
  }

  // 发送弹幕
  function handleSendDanmaku() {
    if (!danmaku.trim()) return
    const newDanmaku = {
      id: Date.now().toString(),
      text: danmaku.trim(),
      x: Math.random() * 60,
    }
    setDanmakuList((prev) => [...prev.slice(-20), newDanmaku])
    setDanmaku("")

    // 3秒后移除
    setTimeout(() => {
      setDanmakuList((prev) => prev.filter((d) => d.id !== newDanmaku.id))
    }, 3000)
  }

  // 解析角色列表
  const characters = theater.characters ? JSON.parse(theater.characters) : []
  const isCreator = userId === theater.creator.id

  // 角色颜色映射
  const charColors = [
    "from-purple-400 to-pink-400",
    "from-blue-400 to-cyan-400",
    "from-green-400 to-emerald-400",
    "from-orange-400 to-red-400",
    "from-indigo-400 to-violet-400",
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* 弹幕层 */}
      <div className="fixed inset-0 pointer-events-none z-20 overflow-hidden">
        {danmakuList.map((d) => (
          <div
            key={d.id}
            className="absolute text-white/70 text-sm font-medium whitespace-nowrap animate-slide-left"
            style={{
              top: `${10 + Math.random() * 40}%`,
              left: `${100 + d.x}%`,
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
          >
            {d.text}
          </div>
        ))}
      </div>

      {/* 头部 */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-sm">
        <div className="flex items-center gap-3 p-4">
          <Link href="/theater">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold truncate">{theater.title}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Badge className={`text-[10px] ${currentStatus.className}`}>
                {currentStatus.label}
              </Badge>
              <span>{theater.creator.name}</span>
              {countdown !== null && countdown > 0 && (
                <span className="text-amber-400">
                  ⏱ {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </span>
              )}
            </div>
          </div>

          {/* 创建者控制面板 */}
          {isCreator && theater.status === "live" && (
            <Button
              size="sm"
              onClick={handleAdvance}
              disabled={isAdvancing}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-xs"
            >
              {isAdvancing ? "AI思考中..." : "推进剧情"}
            </Button>
          )}
        </div>
      </div>

      {/* 角色列表 */}
      {characters.length > 0 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
          {characters.map((char: { name: string; personality: string }, i: number) => (
            <div
              key={i}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-xs"
            >
              <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${charColors[i % charColors.length]} flex items-center justify-center text-[10px] font-bold`}>
                {char.name[0]}
              </div>
              <span>{char.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* 故事内容 */}
      <div className="px-4 py-4 space-y-4 pb-32">
        {theater.sessions.map((session) => (
          <div key={session.id} className="space-y-3">
            {/* 幕标题 */}
            {session.title && (
              <div className="text-center my-4">
                <span className="text-xs text-gray-500 px-3 py-1 rounded-full border border-gray-700">
                  {session.title}
                </span>
              </div>
            )}

            {/* 消息流 - 带打字机动画 */}
            {session.messages.map((msg, msgIdx) => {
              if (msg.messageType === "narration" || msg.role === "narrator") {
                return (
                  <div
                    key={msg.id}
                    className="text-center animate-fade-in"
                    style={{ animationDelay: `${msgIdx * 200}ms` }}
                  >
                    <p className="text-sm text-gray-400 italic px-6">{msg.content}</p>
                  </div>
                )
              }

              if (msg.role === "character") {
                const charIdx = characters.findIndex(
                  (c: { name: string }) => c.name === msg.character
                )
                const color = charColors[charIdx >= 0 ? charIdx % charColors.length : 0]

                return (
                  <div
                    key={msg.id}
                    className="flex gap-2 animate-fade-in"
                    style={{ animationDelay: `${msgIdx * 200}ms` }}
                  >
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                      {msg.character?.[0] || "?"}
                    </div>
                    <div className="max-w-[80%]">
                      <p className="text-xs text-purple-400 font-medium mb-0.5">
                        {msg.character}
                      </p>
                      <div className="bg-white/10 rounded-2xl rounded-tl-none px-3 py-2">
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div key={msg.id} className="text-center">
                  <p className="text-xs text-gray-500">{msg.content}</p>
                </div>
              )
            })}

            {/* 投票选项 */}
            {session.options.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-xs text-center text-amber-400 font-medium">
                  {session.status === "voting" ? (
                    <>
                      🎭 {t("theater.voting")}
                      {countdown !== null && countdown > 0 && (
                        <span className="ml-2">
                          ({Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")})
                        </span>
                      )}
                    </>
                  ) : (
                    <>✅ {t("theater.yourChoice")}</>
                  )}
                </p>
                {session.options.map((option) => {
                  const totalVotes = session.options.reduce(
                    (sum, o) => sum + (o._count?.votes || o.voteCount || 0),
                    0
                  )
                  const votes = option._count?.votes || option.voteCount || 0
                  const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
                  const hasVoted = userVotes.has(option.id)
                  const sessionHasVote = session.options.some((o) => userVotes.has(o.id))

                  return (
                    <button
                      key={option.id}
                      onClick={() => handleVote(option.id)}
                      disabled={!userId || sessionHasVote || !!votingOptionId || session.status !== "voting"}
                      className={`w-full relative overflow-hidden rounded-xl p-3 text-left transition-all ${
                        hasVoted
                          ? "bg-primary/20 ring-2 ring-primary"
                          : "bg-white/10 hover:bg-white/15 disabled:opacity-60"
                      }`}
                    >
                      {/* 投票比例背景条 */}
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-1000 ease-out"
                        style={{ width: `${percent}%` }}
                      />
                      <div className="relative flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{option.label}</p>
                          {option.description && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {option.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-sm font-bold">{percent}%</span>
                          <p className="text-[10px] text-gray-500">
                            {votes} 票
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {theater.sessions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-4">🎭</div>
            <p>{t("theater.storyBegins")}</p>
            {isCreator && (
              <Button
                className="mt-4 bg-gradient-to-r from-purple-500 to-pink-500"
                onClick={handleAdvance}
                disabled={isAdvancing}
              >
                {isAdvancing ? "AI 正在创作开场..." : "开启第一幕"}
              </Button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 底部弹幕输入 */}
      {theater.status === "live" && userId && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 p-3 pb-safe z-10">
          <div className="flex gap-2 max-w-screen-md mx-auto">
            <input
              type="text"
              value={danmaku}
              onChange={(e) => setDanmaku(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendDanmaku()}
              placeholder={t("theater.chatPlaceholder")}
              className="flex-1 px-4 py-2.5 rounded-full bg-white/10 border-0 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <Button
              size="icon"
              className="rounded-full w-10 h-10"
              onClick={handleSendDanmaku}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* CSS 动画 */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideLeft {
          from { transform: translateX(0); }
          to { transform: translateX(-200vw); }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out both;
        }
        .animate-slide-left {
          animation: slideLeft 5s linear forwards;
        }
        .pb-safe {
          padding-bottom: max(12px, env(safe-area-inset-bottom));
        }
      `}</style>
    </div>
  )
}
