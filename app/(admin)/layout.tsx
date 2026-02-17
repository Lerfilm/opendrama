import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { isAdmin } from "@/lib/admin"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home, Film, Sparkles, Upload, BarChart3 } from "lucide-react"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session || !isAdmin(session.user?.email)) {
    redirect("/")
  }

  const navItems = [
    { href: "/admin", icon: Home, label: "概览" },
    { href: "/admin/series", icon: Film, label: "剧集管理" },
    { href: "/admin/cards", icon: Sparkles, label: "卡牌管理" },
    { href: "/admin/upload", icon: Upload, label: "视频上传" },
    { href: "/admin/analytics", icon: BarChart3, label: "数据分析" },
  ]

  return (
    <div className="min-h-screen bg-muted/30">
      {/* 顶部导航 */}
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <h1 className="text-xl font-bold">OpenDrama CMS</h1>
            </Link>
            <nav className="hidden md:flex items-center gap-2">
              {navItems.map(({ href, icon: Icon, label }) => (
                <Link key={href} href={href}>
                  <Button variant="ghost" size="sm">
                    <Icon className="w-4 h-4 mr-2" />
                    {label}
                  </Button>
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="outline" size="sm">
                返回前台
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="container mx-auto p-4">{children}</main>
    </div>
  )
}
