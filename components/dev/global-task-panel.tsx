"use client"

import { useEffect, useRef, useState } from "react"
import { useAITasks, type AITask } from "@/lib/ai-task-context"

// ── ETA helper ──────────────────────────────────────────────────────────────

function formatEta(ms: number): string {
  if (ms <= 0) return ""
  const secs = Math.ceil(ms / 1000)
  if (secs < 60) return `~${secs}s left`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return `~${mins}:${String(rem).padStart(2, "0")} left`
}

function calcEta(task: AITask): string {
  if (task.status !== "running") return ""
  const elapsed = Date.now() - task.startedAt
  if (task.done > 0) {
    const avgMs = elapsed / task.done
    const remaining = avgMs * (task.total - task.done)
    return formatEta(remaining)
  }
  // No items done yet — use estimate
  return formatEta(task.estimatedMsPerItem * task.total)
}

// ── Status icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: AITask["status"] }) {
  switch (status) {
    case "running":
      return (
        <span className="inline-block w-3.5 h-3.5 relative">
          <span
            className="absolute inset-0 rounded-full animate-spin"
            style={{
              border: "2px solid transparent",
              borderTopColor: "#4F46E5",
              borderRightColor: "#4F46E5",
            }}
          />
        </span>
      )
    case "completed":
      return <span style={{ color: "#10B981", fontWeight: 700, fontSize: 13 }}>✓</span>
    case "failed":
      return <span style={{ color: "#EF4444", fontWeight: 700, fontSize: 13 }}>✗</span>
    case "cancelled":
      return <span style={{ color: "#9CA3AF", fontWeight: 700, fontSize: 13 }}>⏹</span>
    default:
      return null
  }
}

// ── Progress bar color ──────────────────────────────────────────────────────

function barColor(status: AITask["status"]) {
  switch (status) {
    case "running":
      return "linear-gradient(90deg, #4F46E5, #7C3AED)"
    case "completed":
      return "#10B981"
    case "failed":
      return "#EF4444"
    case "cancelled":
      return "#9CA3AF"
  }
}

// ── Single task card ────────────────────────────────────────────────────────

function TaskCard({ task }: { task: AITask }) {
  const { cancelTask, dismissTask } = useAITasks()
  const eta = calcEta(task)
  const isActive = task.status === "running"
  const isDone = task.status !== "running"

  return (
    <div
      className="px-3 py-2.5 border-b last:border-b-0 animate-in slide-in-from-bottom-2 fade-in duration-200"
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
    >
      {/* Title row */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusIcon status={task.status} />
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: isDone ? "#888" : "#333" }}
          >
            {task.label}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <button
              onClick={() => cancelTask(task.id)}
              className="text-[10px] px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
              style={{ color: "#EF4444" }}
              title="Cancel"
            >
              Cancel
            </button>
          )}
          {isDone && (
            <button
              onClick={() => dismissTask(task.id)}
              className="text-[10px] px-1 py-0.5 rounded hover:bg-gray-100 transition-colors"
              style={{ color: "#999" }}
              title="Dismiss"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Current item */}
      {task.currentItem && isActive && (
        <div
          className="text-[10px] truncate mb-1"
          style={{ color: "#888" }}
        >
          {task.currentItem}
        </div>
      )}

      {/* Completed/cancelled summary */}
      {task.status === "completed" && (
        <div className="text-[10px] mb-1" style={{ color: "#10B981" }}>
          Completed ({task.done}/{task.total})
        </div>
      )}
      {task.status === "cancelled" && (
        <div className="text-[10px] mb-1" style={{ color: "#9CA3AF" }}>
          Cancelled ({task.done}/{task.total} done)
        </div>
      )}
      {task.status === "failed" && (
        <div className="text-[10px] mb-1 truncate" style={{ color: "#EF4444" }}>
          {task.error || "Failed"}
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#E8E8E8" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${task.progress}%`,
            background: barColor(task.status),
          }}
        />
      </div>

      {/* Progress text */}
      <div className="flex justify-between items-center mt-0.5">
        <span className="text-[9px]" style={{ color: "#AAA" }}>
          {task.progress}%
          {task.total > 1 && ` · ${task.done}/${task.total}`}
        </span>
        {eta && (
          <span className="text-[9px]" style={{ color: "#AAA" }}>
            {eta}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────────

export function GlobalTaskPanel() {
  const { tasks, dismissTask } = useAITasks()
  const [collapsed, setCollapsed] = useState(false)

  // Auto-dismiss completed tasks after 8 seconds
  const autoDismissTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    for (const task of tasks) {
      if (
        (task.status === "completed" || task.status === "cancelled") &&
        !autoDismissTimers.current.has(task.id)
      ) {
        const timer = setTimeout(() => {
          dismissTask(task.id)
          autoDismissTimers.current.delete(task.id)
        }, 8000)
        autoDismissTimers.current.set(task.id, timer)
      }
    }

    // Clean up timers for tasks that no longer exist
    for (const [id, timer] of autoDismissTimers.current) {
      if (!tasks.find(t => t.id === id)) {
        clearTimeout(timer)
        autoDismissTimers.current.delete(id)
      }
    }
  }, [tasks, dismissTask])

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of autoDismissTimers.current.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  // Nothing to show
  if (tasks.length === 0) return null

  const activeTasks = tasks.filter(t => t.status === "running")
  const completedTasks = tasks.filter(t => t.status !== "running")

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-lg shadow-xl overflow-hidden"
      style={{
        width: collapsed ? 240 : 340,
        background: "#FAFAFA",
        border: "1px solid rgba(0,0,0,0.08)",
        maxHeight: "60vh",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none"
        style={{ background: "#F0F0F0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
        onClick={() => setCollapsed(prev => !prev)}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 11 }}>✨</span>
          <span className="text-[11px] font-semibold" style={{ color: "#555" }}>
            AI Tasks
          </span>
          {activeTasks.length > 0 && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              {activeTasks.length}
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: "#999" }}>
          {collapsed ? "▲" : "▼"}
        </span>
      </div>

      {/* Task list */}
      {!collapsed && (
        <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
          {/* Active tasks first */}
          {activeTasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
          {/* Then completed/failed/cancelled */}
          {completedTasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Collapsed mini view — show combined progress */}
      {collapsed && activeTasks.length > 0 && (
        <div className="px-3 py-1.5">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#E8E8E8" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round(activeTasks.reduce((s, t) => s + t.progress, 0) / activeTasks.length)}%`,
                background: "linear-gradient(90deg, #4F46E5, #7C3AED)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
