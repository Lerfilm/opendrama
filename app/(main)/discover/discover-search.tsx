"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Search } from "@/components/icons"
import { t } from "@/lib/i18n"

export function DiscoverSearch({ defaultValue = "" }: { defaultValue?: string }) {
  const [query, setQuery] = useState(defaultValue)
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (query) {
      params.set("q", query)
    } else {
      params.delete("q")
    }
    router.push(`/discover?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("discover.search")}
        className="w-full pl-10 pr-4 py-2.5 rounded-full bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </form>
  )
}
