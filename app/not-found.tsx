import { Button } from "@/components/ui/button"
import Link from "next/link"
import { t } from "@/lib/i18n"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <span className="text-3xl">🔍</span>
      </div>
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-muted-foreground mb-6">{t("error.notFound")}</p>
      <Link href="/">
        <Button>{t("nav.home")}</Button>
      </Link>
    </div>
  )
}
