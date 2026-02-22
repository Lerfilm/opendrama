export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { isDeveloper, isDevModeActive } from "@/lib/developer"
import { TopBar } from "@/components/dev/top-bar"
import { LeftNav } from "@/components/dev/left-nav"
import prisma from "@/lib/prisma"

export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  if (!isDeveloper(session.user.email)) {
    redirect("/")
  }

  if (!(await isDevModeActive())) {
    redirect("/developer")
  }

  // Fetch user balance
  const balanceRecord = await prisma.userBalance.findUnique({
    where: { userId: session.user.id as string },
  })
  const availableBalance = (balanceRecord?.balance ?? 0) - (balanceRecord?.reserved ?? 0)

  return (
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
  )
}
