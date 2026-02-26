import { BottomNav } from "@/components/bottom-nav"
import { TopNav } from "@/components/top-nav"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pt-14">
      <TopNav />
      <main className="max-w-screen-lg mx-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
