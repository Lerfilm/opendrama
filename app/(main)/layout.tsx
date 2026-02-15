import { BottomNav } from "@/components/bottom-nav"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="max-w-screen-sm mx-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
