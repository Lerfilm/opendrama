import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { t } from "@/lib/i18n"
import { TextToVideoForm } from "./t2v-form"
import { VideoHistory } from "./video-history"

export default async function TextToVideoPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  return (
    <div className="space-y-6 p-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold">{t("t2v.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("t2v.subtitle")}</p>
      </div>

      <TextToVideoForm userCoins={(session.user as any)?.coins || 0} />

      <VideoHistory userId={session.user.id} />
    </div>
  )
}
