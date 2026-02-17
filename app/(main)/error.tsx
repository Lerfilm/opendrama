"use client"

import { Button } from "@/components/ui/button"

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <span className="text-3xl">😵</span>
      </div>
      <h1 className="text-xl font-bold mb-2">加载失败</h1>
      <p className="text-muted-foreground mb-6 max-w-md text-sm">
        内容加载时遇到了问题，请稍后再试。
      </p>
      <Button onClick={() => reset()} size="sm">
        重试
      </Button>
    </div>
  )
}
