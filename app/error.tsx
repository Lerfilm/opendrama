"use client"

import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <span className="text-3xl">😵</span>
      </div>
      <h1 className="text-2xl font-bold mb-2">{t("error.somethingWrong")}</h1>
      <p className="text-muted-foreground mb-6 max-w-md">
        {t("error.somethingWrongDesc")}
      </p>
      <Button onClick={() => reset()}>{t("common.retry")}</Button>
    </div>
  )
}
