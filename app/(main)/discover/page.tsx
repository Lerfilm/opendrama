import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function DiscoverPage() {
  const session = await auth()

  if (!session) {
    redirect("/auth/signin")
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">发现</h1>
      <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
        <p className="text-muted-foreground">分类浏览功能即将上线</p>
      </div>
    </div>
  )
}
