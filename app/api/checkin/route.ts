import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { addTokens } from "@/lib/tokens"

// Reward schedule: Day 1=2, Day 2=3, ..., Day 7=10, then cycles
const REWARDS = [2, 3, 4, 5, 6, 8, 10]
function getReward(streak: number): number {
  const dayIndex = ((streak - 1) % 7) // 0-6
  return REWARDS[dayIndex]
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10) // "2026-02-27"
}

function getYesterdayString(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

// GET: Check today's check-in status
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = getTodayString()
  const userId = session.user.id

  // Get today's check-in if any
  const todayCheckIn = await prisma.dailyCheckIn.findUnique({
    where: { userId_date: { userId, date: today } },
  })

  // Get the latest check-in for streak info
  const latestCheckIn = await prisma.dailyCheckIn.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
  })

  // Calculate current streak
  let currentStreak = 0
  if (latestCheckIn) {
    if (latestCheckIn.date === today) {
      currentStreak = latestCheckIn.streak
    } else if (latestCheckIn.date === getYesterdayString()) {
      currentStreak = latestCheckIn.streak
    }
    // else streak has broken
  }

  // Get this week's check-ins (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const weekStart = sevenDaysAgo.toISOString().slice(0, 10)

  const weekCheckins = await prisma.dailyCheckIn.findMany({
    where: { userId, date: { gte: weekStart } },
    orderBy: { date: "asc" },
  })

  return NextResponse.json({
    checkedInToday: !!todayCheckIn,
    currentStreak,
    todayReward: todayCheckIn?.reward || getReward(currentStreak + 1),
    weekCheckins: weekCheckins.map((c) => ({ date: c.date, reward: c.reward })),
  })
}

// POST: Perform check-in
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = getTodayString()
  const userId = session.user.id

  // Check if already checked in today
  const existing = await prisma.dailyCheckIn.findUnique({
    where: { userId_date: { userId, date: today } },
  })

  if (existing) {
    return NextResponse.json({ error: "Already checked in today", alreadyCheckedIn: true }, { status: 400 })
  }

  // Calculate streak
  const yesterday = getYesterdayString()
  const yesterdayCheckIn = await prisma.dailyCheckIn.findUnique({
    where: { userId_date: { userId, date: yesterday } },
  })

  const streak = yesterdayCheckIn ? yesterdayCheckIn.streak + 1 : 1
  const reward = getReward(streak)

  // Create check-in record
  const checkIn = await prisma.dailyCheckIn.create({
    data: { userId, date: today, reward, streak },
  })

  // Add coins using addTokens() — properly updates UserBalance,
  // creates TokenTransaction with correct balanceAfter, and syncs User.coins
  await addTokens(userId, reward, "bonus", {
    type: "daily_checkin",
    streak,
    date: today,
  })

  return NextResponse.json({
    success: true,
    reward,
    streak,
    date: today,
  })
}
