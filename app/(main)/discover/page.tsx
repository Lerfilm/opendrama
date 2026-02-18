import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { t } from "@/lib/i18n"

export default async function DiscoverPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{t("discover.title")}</h1>
      <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
        <p className="text-muted-foreground">{t("discover.comingSoon")}</p>
      </div>
    </div>
  )
}
