// 管理员邮箱白名单（支持逗号分隔的 ADMIN_EMAILS 或单独的 ADMIN_EMAIL_* 变量）
const ADMIN_EMAILS = [
  ...(process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim()) || []),
  process.env.ADMIN_EMAIL,
  process.env.ADMIN_EMAIL_2,
  process.env.ADMIN_EMAIL_3,
].filter(Boolean) as string[]

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email)
}

export function requireAdmin(email: string | null | undefined) {
  if (!isAdmin(email)) {
    throw new Error("Unauthorized: Admin access required")
  }
}
