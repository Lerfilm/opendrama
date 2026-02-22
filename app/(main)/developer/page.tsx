export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { isDeveloper } from "@/lib/developer"
import { t } from "@/lib/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Code } from "@/components/icons"
import Link from "next/link"
import { cookies } from "next/headers"

export default async function DeveloperPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  // 权限检查：仅白名单开发者可访问
  if (!isDeveloper(session.user.email)) {
    redirect("/profile")
  }

  const cookieStore = await cookies()
  const devMode = cookieStore.get("devMode")?.value === "1"

  async function toggleDevMode() {
    "use server"
    const cookieStore = await cookies()
    const current = cookieStore.get("devMode")?.value === "1"
    cookieStore.set("devMode", current ? "0" : "1", {
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    })
    revalidatePath("/developer")
  }

  return (
    <div className="p-4 space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3">
        <Link href="/profile">
          <Button variant="ghost" size="sm">
            ←
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5" />
          <h1 className="text-xl font-bold">{t("developer.title")}</h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t("developer.subtitle")}</p>

      {/* 开发者模式开关 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("developer.modeToggle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div className="flex-1 pr-4">
              <p className="text-sm text-muted-foreground">{t("developer.modeDesc")}</p>
            </div>
            <form action={toggleDevMode}>
              <button type="submit" className="flex items-center gap-2">
                <Badge variant={devMode ? "default" : "secondary"}>
                  {devMode ? t("developer.modeOn") : t("developer.modeOff")}
                </Badge>
                <div className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${
                  devMode ? "bg-primary" : "bg-muted"
                }`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                    devMode ? "right-0.5" : "left-0.5"
                  }`} />
                </div>
              </button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* 开发者工具占位 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("developer.tools")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Code className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">{t("developer.comingSoon")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
