import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { createT, getLocaleAsync } from "@/lib/i18n"
import prisma from "@/lib/prisma"
import { TextToVideoForm } from "./t2v-form"
import { VideoHistory } from "./video-history"

export default async function TextToVideoPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")
  const t = createT(await getLocaleAsync())

  const userBalance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id },
  })
  const availableCoins = Math.max(0, (userBalance?.balance ?? 0) - (userBalance?.reserved ?? 0))

  return (
    <div className="space-y-6 p-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold">{t("t2v.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("t2v.subtitle")}</p>
      </div>

      <TextToVideoForm userCoins={availableCoins} />

      <VideoHistory userId={session.user.id} />
    </div>
  )
}
