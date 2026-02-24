"use client"

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react"

// ── Types ────────────────────────────────────────────────────────────────────

export interface AITask {
  id: string
  type: string            // 'generate_portraits' | 'fill_specs' | …
  label: string           // user-visible label, e.g. "Generating Portraits"
  scriptId?: string
  status: "running" | "completed" | "failed" | "cancelled"
  progress: number        // 0-100
  total: number
  done: number
  currentItem: string     // e.g. "John Smith (3/8)"
  startedAt: number       // Date.now()
  estimatedMsPerItem: number
  error?: string
  /** internal: DB job id for persistence */
  _jobId?: string
}

export interface BatchTaskConfig {
  type: string
  label: string
  scriptId?: string
  items: { id: string; label: string }[]
  estimatedMsPerItem: number
  /** Called for each item. Must do its own DB save. Throw to mark item as failed. */
  executeFn: (itemId: string, signal: AbortSignal) => Promise<any>
  /** Optional: real-time callback when component is still mounted */
  onItemDone?: (itemId: string, result: any) => void
  /** If set, creates a persistent DB job via /api/casting/bulk-job */
  dbJobType?: string
  dbJobPayload?: { scriptId: string; roleIds: string[] }
}

export interface AITaskContextValue {
  tasks: AITask[]
  startBatchTask: (config: BatchTaskConfig) => string
  registerSingleTask: (type: string, label: string, estimatedMs: number, scriptId?: string) => string
  completeSingleTask: (taskId: string) => void
  failSingleTask: (taskId: string, error?: string) => void
  cancelTask: (taskId: string) => void
  dismissTask: (taskId: string) => void
  /** Subscribe to item-done events for a specific task. Returns unsubscribe fn. */
  subscribe: (taskId: string, cb: (itemId: string, result: any) => void) => () => void
  /** Subscribe to task completion. Returns unsubscribe fn. */
  onTaskEnd: (taskId: string, cb: (task: AITask) => void) => () => void
  /** Check if a task of given type (and optional scriptId) is already running */
  isRunning: (type: string, scriptId?: string) => boolean
}

// ── Context ──────────────────────────────────────────────────────────────────

const AITaskContext = createContext<AITaskContextValue | null>(null)

export function useAITasks(): AITaskContextValue {
  const ctx = useContext(AITaskContext)
  if (!ctx) throw new Error("useAITasks must be used within <AITaskProvider>")
  return ctx
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let taskCounter = 0
function nextTaskId() {
  return `aitask_${Date.now()}_${++taskCounter}`
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AITaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<AITask[]>([])

  // Refs so closures always see latest values
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  // AbortControllers keyed by taskId
  const abortMap = useRef(new Map<string, AbortController>())

  // Item-done listeners keyed by taskId
  const itemListeners = useRef(new Map<string, Set<(itemId: string, result: any) => void>>())

  // Task-end listeners keyed by taskId
  const endListeners = useRef(new Map<string, Set<(task: AITask) => void>>())

  // ── Internal helpers ─────────────────────────────────────────────────────

  const updateTask = useCallback((taskId: string, patch: Partial<AITask>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))
  }, [])

  const notifyItemDone = useCallback((taskId: string, itemId: string, result: any) => {
    const set = itemListeners.current.get(taskId)
    if (set) {
      for (const cb of set) {
        try { cb(itemId, result) } catch { /* ignore */ }
      }
    }
  }, [])

  const notifyTaskEnd = useCallback((taskId: string) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    const set = endListeners.current.get(taskId)
    if (set) {
      for (const cb of set) {
        try { cb(task) } catch { /* ignore */ }
      }
    }
  }, [])

  // ── Public API ───────────────────────────────────────────────────────────

  const startBatchTask = useCallback((config: BatchTaskConfig): string => {
    const taskId = nextTaskId()
    const ac = new AbortController()
    abortMap.current.set(taskId, ac)

    const task: AITask = {
      id: taskId,
      type: config.type,
      label: config.label,
      scriptId: config.scriptId,
      status: "running",
      progress: 0,
      total: config.items.length,
      done: 0,
      currentItem: "",
      startedAt: Date.now(),
      estimatedMsPerItem: config.estimatedMsPerItem,
    }

    setTasks(prev => [...prev, task])

    // Run the batch loop async — this runs in the Provider scope,
    // so it survives child component unmounts.
    ;(async () => {
      let done = 0
      let jobId: string | undefined

      // Create DB job if requested
      if (config.dbJobType && config.dbJobPayload) {
        try {
          const res = await fetch("/api/casting/bulk-job", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scriptId: config.dbJobPayload.scriptId,
              type: config.dbJobType,
              roleIds: config.dbJobPayload.roleIds,
            }),
          })
          if (res.ok) {
            const { job } = await res.json()
            jobId = job.id
            updateTask(taskId, { _jobId: jobId })
          }
        } catch { /* continue without DB persistence */ }
      }

      for (const item of config.items) {
        // Check abort
        if (ac.signal.aborted) break

        // Update current item
        updateTask(taskId, {
          currentItem: `${item.label} (${done + 1}/${config.items.length})`,
        })

        try {
          const result = await config.executeFn(item.id, ac.signal)

          if (ac.signal.aborted) break

          done++
          const pct = Math.round((done / config.items.length) * 100)
          updateTask(taskId, { done, progress: pct })

          // Notify subscribers
          notifyItemDone(taskId, item.id, result)

          // Also call onItemDone if provided
          if (config.onItemDone) {
            try { config.onItemDone(item.id, result) } catch { /* ignore */ }
          }

          // Persist progress to DB
          if (jobId) {
            fetch("/api/casting/bulk-job", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId, completedRoleId: item.id, progress: pct }),
            }).catch(() => {})
          }
        } catch (err: any) {
          if (ac.signal.aborted) break
          // Item failed — skip and continue
          done++
          const pct = Math.round((done / config.items.length) * 100)
          updateTask(taskId, { done, progress: pct })
          console.warn(`[AITask] Item ${item.label} failed:`, err?.message)
        }
      }

      // Finalize
      if (ac.signal.aborted) {
        updateTask(taskId, { status: "cancelled", currentItem: "" })
      } else {
        updateTask(taskId, { status: "completed", progress: 100, currentItem: "" })
      }

      // Clean up DB job
      if (jobId) {
        fetch(`/api/casting/bulk-job?jobId=${jobId}`, { method: "DELETE" }).catch(() => {})
      }

      abortMap.current.delete(taskId)
      notifyTaskEnd(taskId)
    })()

    return taskId
  }, [updateTask, notifyItemDone, notifyTaskEnd])

  const registerSingleTask = useCallback((
    type: string, label: string, estimatedMs: number, scriptId?: string,
  ): string => {
    const taskId = nextTaskId()
    const task: AITask = {
      id: taskId,
      type,
      label,
      scriptId,
      status: "running",
      progress: 0,
      total: 1,
      done: 0,
      currentItem: label,
      startedAt: Date.now(),
      estimatedMsPerItem: estimatedMs,
    }
    setTasks(prev => [...prev, task])
    return taskId
  }, [])

  const completeSingleTask = useCallback((taskId: string) => {
    updateTask(taskId, { status: "completed", progress: 100, done: 1, currentItem: "" })
    notifyTaskEnd(taskId)
  }, [updateTask, notifyTaskEnd])

  const failSingleTask = useCallback((taskId: string, error?: string) => {
    updateTask(taskId, { status: "failed", error: error || "Failed", currentItem: "" })
    notifyTaskEnd(taskId)
  }, [updateTask, notifyTaskEnd])

  const cancelTask = useCallback((taskId: string) => {
    const ac = abortMap.current.get(taskId)
    if (ac) ac.abort()
    // Also try to delete DB job
    const task = tasksRef.current.find(t => t.id === taskId)
    if (task?._jobId) {
      fetch(`/api/casting/bulk-job?jobId=${task._jobId}`, { method: "DELETE" }).catch(() => {})
    }
    updateTask(taskId, { status: "cancelled", currentItem: "" })
  }, [updateTask])

  const dismissTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    abortMap.current.delete(taskId)
    itemListeners.current.delete(taskId)
    endListeners.current.delete(taskId)
  }, [])

  const subscribe = useCallback((
    taskId: string,
    cb: (itemId: string, result: any) => void,
  ): (() => void) => {
    if (!itemListeners.current.has(taskId)) {
      itemListeners.current.set(taskId, new Set())
    }
    itemListeners.current.get(taskId)!.add(cb)
    return () => { itemListeners.current.get(taskId)?.delete(cb) }
  }, [])

  const onTaskEnd = useCallback((
    taskId: string,
    cb: (task: AITask) => void,
  ): (() => void) => {
    if (!endListeners.current.has(taskId)) {
      endListeners.current.set(taskId, new Set())
    }
    endListeners.current.get(taskId)!.add(cb)
    return () => { endListeners.current.get(taskId)?.delete(cb) }
  }, [])

  const isRunning = useCallback((type: string, scriptId?: string): boolean => {
    return tasksRef.current.some(t =>
      t.type === type &&
      t.status === "running" &&
      (!scriptId || t.scriptId === scriptId)
    )
  }, [])

  const value: AITaskContextValue = {
    tasks,
    startBatchTask,
    registerSingleTask,
    completeSingleTask,
    failSingleTask,
    cancelTask,
    dismissTask,
    subscribe,
    onTaskEnd,
    isRunning,
  }

  return (
    <AITaskContext.Provider value={value}>
      {children}
    </AITaskContext.Provider>
  )
}
