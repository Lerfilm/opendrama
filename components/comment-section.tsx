"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { MessageCircle, Trash2, Loader2 } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"

interface Comment {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    name: string | null
    image: string | null
  }
}

interface CommentSectionProps {
  seriesId: string
  initialComments: Comment[]
  initialTotal: number
  isLoggedIn: boolean
  currentUserId?: string
}

function timeAgo(date: string, t: (key: string, params?: Record<string, any>) => string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return t("review.justNow")
  if (diff < 3600) return t("review.minutesAgo", { min: Math.floor(diff / 60) })
  if (diff < 86400) return t("review.hoursAgo", { hours: Math.floor(diff / 3600) })
  return t("review.daysAgo", { days: Math.floor(diff / 86400) })
}

export default function CommentSection({
  seriesId,
  initialComments,
  initialTotal,
  isLoggedIn,
  currentUserId,
}: CommentSectionProps) {
  const router = useRouter()
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [total, setTotal] = useState(initialTotal)
  const [content, setContent] = useState("")
  const [isPosting, setIsPosting] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialComments.length < initialTotal)

  const handlePost = async () => {
    if (!isLoggedIn) {
      router.push("/auth/signin")
      return
    }
    if (!content.trim() || isPosting) return

    setIsPosting(true)
    try {
      const res = await fetch(`/api/series/${seriesId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setComments([data.comment, ...comments])
        setTotal(data.total)
        setContent("")
      }
    } catch {
      // ignore
    } finally {
      setIsPosting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    if (!confirm(t("review.deleteConfirm"))) return

    try {
      const res = await fetch(`/api/series/${seriesId}/comments/${commentId}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (res.ok) {
        setComments(comments.filter((c) => c.id !== commentId))
        setTotal(data.total)
      }
    } catch {
      // ignore
    }
  }

  const loadMore = async () => {
    setIsLoadingMore(true)
    const nextPage = page + 1
    try {
      const res = await fetch(`/api/series/${seriesId}/comments?page=${nextPage}&limit=20`)
      const data = await res.json()
      if (res.ok) {
        setComments([...comments, ...data.comments])
        setPage(nextPage)
        setHasMore(data.hasMore)
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <MessageCircle className="w-5 h-5" />
        {t("review.comments", { count: total })}
      </h3>

      {/* Input */}
      {isLoggedIn ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 500))}
            placeholder={t("review.writeComment")}
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handlePost()}
            disabled={isPosting}
          />
          <Button
            size="sm"
            onClick={handlePost}
            disabled={!content.trim() || isPosting}
            className="shrink-0"
          >
            {isPosting ? t("review.posting") : t("review.postComment")}
          </Button>
        </div>
      ) : (
        <button
          onClick={() => router.push("/auth/signin")}
          className="w-full text-center text-sm text-muted-foreground py-3 rounded-lg border border-dashed hover:border-indigo-500 hover:text-indigo-500 transition-colors"
        >
          {t("review.loginToComment")}
        </button>
      )}

      {content.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {t("review.charLimit", { count: content.length })}
        </p>
      )}

      {/* Comments list */}
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {t("review.noComments")}
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              {/* Avatar */}
              <div className="shrink-0">
                {comment.user.image ? (
                  <Image
                    src={comment.user.image}
                    alt={comment.user.name || ""}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                    {(comment.user.name || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium truncate">
                    {comment.user.name || "Anonymous"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {timeAgo(comment.createdAt, t)}
                  </span>
                  {comment.user.id === currentUserId && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="ml-auto text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-foreground/90 break-words">
                  {comment.content}
                </p>
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="w-full text-center text-sm text-indigo-500 py-2 hover:text-indigo-600 transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? (
                <Loader2 className="w-4 h-4 mx-auto animate-spin" />
              ) : (
                t("review.loadMore")
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
