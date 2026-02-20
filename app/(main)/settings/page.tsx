export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { t, getLocale, setLocale } from "@/lib/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { cookies } from "next/headers"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect("/auth/signin")
  }

  const locale = getLocale()

  async function switchLocale(formData: FormData) {
    "use server"
    const newLocale = formData.get("locale") as string
    if (newLocale === "zh" || newLocale === "en") {
      const cookieStore = await cookies()
      cookieStore.set("locale", newLocale, {
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      })
    }
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/profile">
          <Button variant="ghost" size="sm">
            ← {t("common.back")}
          </Button>
        </Link>
        <h1 className="text-xl font-bold">{t("profile.settings")}</h1>
      </div>

      {/* 语言设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={switchLocale} className="flex gap-2">
            <input type="hidden" name="locale" value="zh" />
            <Button
              type="submit"
              variant={locale === "zh" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              name="locale"
              value="zh"
            >
              中文
            </Button>
          </form>
          <form action={switchLocale} className="mt-2">
            <Button
              type="submit"
              variant={locale === "en" ? "default" : "outline"}
              size="sm"
              className="w-full"
              name="locale"
              value="en"
            >
              English
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 账号信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("settings.email")}</span>
            <span className="text-sm">{session.user.email}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("settings.loginMethod")}</span>
            <span className="text-sm">Google</span>
          </div>
        </CardContent>
      </Card>

      {/* 通知设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.notifications")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium">{t("settings.newEpisodes")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.newEpisodesDesc")}</p>
            </div>
            <div className="w-10 h-6 bg-primary rounded-full relative cursor-pointer">
              <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium">{t("settings.theaterNotify")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.theaterNotifyDesc")}</p>
            </div>
            <div className="w-10 h-6 bg-primary rounded-full relative cursor-pointer">
              <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 关于 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.about")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("settings.version")}</span>
            <span className="text-sm">1.0.0</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("settings.terms")}</span>
            <Link href="/terms" className="text-sm text-primary">→</Link>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("settings.privacy")}</span>
            <Link href="/privacy" className="text-sm text-primary">→</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
