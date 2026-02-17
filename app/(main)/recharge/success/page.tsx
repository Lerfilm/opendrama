import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Coins } from "lucide-react"
import Link from "next/link"

export default async function RechargeSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string }
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const sessionId = searchParams.session_id

  let purchase = null
  let user = null

  if (sessionId) {
    purchase = await prisma.purchase.findUnique({
      where: { stripeSessionId: sessionId },
    })

    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { coins: true },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">充值成功！</h1>
            <p className="text-muted-foreground">
              您的金币已到账，快去解锁精彩剧集吧
            </p>
          </div>

          {purchase && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Coins className="w-6 h-6 text-amber-600" />
                <span className="text-3xl font-bold text-amber-600">
                  +{purchase.coins}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                支付金额：¥{(purchase.amount / 100).toFixed(2)}
              </p>
            </div>
          )}

          {user && (
            <div className="bg-muted rounded-lg p-4 mb-6">
              <p className="text-sm text-muted-foreground mb-1">当前余额</p>
              <div className="flex items-center justify-center gap-2">
                <Coins className="w-6 h-6 text-primary" />
                <span className="text-2xl font-bold">{user.coins}</span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Link href="/">
              <Button className="w-full" size="lg">
                开始观看
              </Button>
            </Link>
            <Link href="/purchases">
              <Button variant="outline" className="w-full" size="lg">
                查看充值记录
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
