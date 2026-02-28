export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { isDevModeActive } from "@/lib/developer"
import { TopBar } from "@/components/dev/top-bar"
import { LeftNav } from "@/components/dev/left-nav"
import prisma from "@/lib/prisma"
import { AITaskProvider } from "@/lib/ai-task-context"
import { GlobalTaskPanel } from "@/components/dev/global-task-panel"
import { MobileRedirect } from "@/components/dev/mobile-redirect"
import { FeedbackWidget } from "@/components/dev/feedback-widget"

export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  // Dev mode: require devMode cookie (any logged-in user can enable it)
  if (!(await isDevModeActive())) {
    redirect("/developer")
  }

  // Fetch user balance
  const balanceRecord = await prisma.userBalance.findUnique({
    where: { userId: session.user.id as string },
  })
  const availableBalance = (balanceRecord?.balance ?? 0) - (balanceRecord?.reserved ?? 0)

  return (
    <AITaskProvider>
      <div className="h-screen w-screen overflow-hidden grid grid-rows-[40px_1fr] grid-cols-[56px_1fr] text-sm" style={{ background: "#DCDCDC", color: "#1A1A1A" }}>
        <TopBar
          user={{
            name: session.user.name,
            email: session.user.email,
            image: session.user.image,
          }}
          balance={availableBalance}
          className="col-span-2"
        />
        <LeftNav />
        <main className="overflow-hidden" style={{ background: "#E8E8E8" }}>{children}</main>
      </div>
      <GlobalTaskPanel />
      <MobileRedirect />
      <FeedbackWidget />
    </AITaskProvider>
  )
}
