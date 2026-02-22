// 开发者邮箱白名单
// 优先读取 DEVELOPER_EMAILS，未设置则回退到 ADMIN_EMAILS
const DEVELOPER_EMAILS = [
  ...(process.env.DEVELOPER_EMAILS?.split(",").map((e) => e.trim()) || []),
].filter(Boolean) as string[]

function getDeveloperEmails(): string[] {
  if (DEVELOPER_EMAILS.length > 0) return DEVELOPER_EMAILS
  // 回退到管理员邮箱列表
  return [
    ...(process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim()) || []),
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_EMAIL_2,
    process.env.ADMIN_EMAIL_3,
  ].filter(Boolean) as string[]
}

export function isDeveloper(email: string | null | undefined): boolean {
  if (!email) return false
  return getDeveloperEmails().includes(email)
}

/**
 * 检查开发者模式是否已开启（基于 cookie）
 * 仅用于 server component
 */
export async function isDevModeActive(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers")
    const cookieStore = await cookies()
    return cookieStore.get("devMode")?.value === "1"
  } catch {
    return false
  }
}
