import { BottomNav } from "@/components/bottom-nav"
import { TopNav } from "@/components/top-nav"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const userBalance = session?.user?.id
    ? await prisma.userBalance.findUnique({
        where: { userId: session.user.id as string },
        select: { balance: true, reserved: true },
      })
    : null
  const available = userBalance ? userBalance.balance - userBalance.reserved : 0

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pt-14">
      <TopNav
        user={session?.user ? { name: session.user.name, image: session.user.image } : null}
        balance={session?.user ? available : undefined}
      />
      <main className="max-w-screen-lg mx-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
