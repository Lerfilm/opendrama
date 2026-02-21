import { BottomNav } from "@/components/bottom-nav"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <main className="max-w-screen-md mx-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
