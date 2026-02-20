import { createClient } from "@supabase/supabase-js"

/**
 * Supabase 客户端（用于 Realtime 功能）
 * 注意：数据库操作依然通过 Prisma，这里只用 Realtime
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * 剧场频道名称
 */
export function getTheaterChannel(theaterId: string) {
  return `theater:${theaterId}`
}
