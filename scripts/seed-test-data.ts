/**
 * 生成测试数据
 * 运行: npx tsx scripts/seed-test-data.ts
 */

import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// 加载环境变量
config({ path: ".env.local" })

// 使用 DIRECT_URL 避免 pooler 的限制
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🌱 开始生成测试数据...")

  // 创建测试剧集
  const series1 = await prisma.series.create({
    data: {
      title: "霸道总裁的替身新娘",
      description:
        "她本是豪门千金，却被迫成为总裁的替身新娘。当真相揭开，他们的爱情能否经受考验？",
      coverUrl: "https://picsum.photos/seed/drama1/400/600",
      status: "active",
      episodes: {
        create: [
          {
            episodeNum: 1,
            title: "意外邂逅",
            description: "在一场豪华晚宴上，两人第一次相遇...",
            thumbnailUrl: "https://picsum.photos/seed/ep1-1/640/360",
            unlockCost: 0, // 第一集免费
            duration: 180, // 3 分钟
          },
          {
            episodeNum: 2,
            title: "契约婚姻",
            description: "为了家族利益，她被迫签下婚约...",
            thumbnailUrl: "https://picsum.photos/seed/ep1-2/640/360",
            unlockCost: 10,
            duration: 200,
          },
          {
            episodeNum: 3,
            title: "误会加深",
            description: "一场阴谋让两人的关系雪上加霜...",
            thumbnailUrl: "https://picsum.photos/seed/ep1-3/640/360",
            unlockCost: 10,
            duration: 195,
          },
        ],
      },
    },
  })

  const series2 = await prisma.series.create({
    data: {
      title: "重生之豪门千金归来",
      description:
        "重生回到十年前，她发誓要改变命运，守护家人，复仇渣男！",
      coverUrl: "https://picsum.photos/seed/drama2/400/600",
      status: "active",
      episodes: {
        create: [
          {
            episodeNum: 1,
            title: "重生归来",
            description: "睁开眼，她竟然回到了十年前...",
            thumbnailUrl: "https://picsum.photos/seed/ep2-1/640/360",
            unlockCost: 0,
            duration: 190,
          },
          {
            episodeNum: 2,
            title: "复仇计划",
            description: "前世的仇人，今生一个都别想逃...",
            thumbnailUrl: "https://picsum.photos/seed/ep2-2/640/360",
            unlockCost: 10,
            duration: 210,
          },
        ],
      },
    },
  })

  const series3 = await prisma.series.create({
    data: {
      title: "隐婚老公是大佬",
      description: "闪婚后才发现，老公竟是传说中的商业帝国继承人？",
      coverUrl: "https://picsum.photos/seed/drama3/400/600",
      status: "active",
      episodes: {
        create: [
          {
            episodeNum: 1,
            title: "闪婚",
            description: "为了逃避相亲，她选择了闪婚...",
            thumbnailUrl: "https://picsum.photos/seed/ep3-1/640/360",
            unlockCost: 0,
            duration: 175,
          },
          {
            episodeNum: 2,
            title: "隐藏身份",
            description: "老公的真实身份竟是...",
            thumbnailUrl: "https://picsum.photos/seed/ep3-2/640/360",
            unlockCost: 10,
            duration: 205,
          },
          {
            episodeNum: 3,
            title: "身份曝光",
            description: "豪门宴会上，他的身份终于暴露...",
            thumbnailUrl: "https://picsum.photos/seed/ep3-3/640/360",
            unlockCost: 10,
            duration: 195,
          },
          {
            episodeNum: 4,
            title: "危机来袭",
            description: "商业对手对她下手了...",
            thumbnailUrl: "https://picsum.photos/seed/ep3-4/640/360",
            unlockCost: 10,
            duration: 200,
          },
        ],
      },
    },
  })

  // 创建测试卡牌
  await prisma.card.createMany({
    data: [
      {
        seriesId: series1.id,
        name: "总裁卡",
        rarity: "epic",
        imageUrl: "https://picsum.photos/seed/card1/300/400",
        description: "霸道总裁限定卡牌",
      },
      {
        seriesId: series1.id,
        name: "新娘卡",
        rarity: "rare",
        imageUrl: "https://picsum.photos/seed/card2/300/400",
        description: "替身新娘纪念卡",
      },
      {
        seriesId: series2.id,
        name: "重生卡",
        rarity: "legendary",
        imageUrl: "https://picsum.photos/seed/card3/300/400",
        description: "SSR 限定重生卡",
      },
    ],
  })

  console.log("✅ 测试数据生成完成！")
  console.log(`- 创建了 3 部剧集`)
  console.log(`- Series 1: ${series1.title} (3 集)`)
  console.log(`- Series 2: ${series2.title} (2 集)`)
  console.log(`- Series 3: ${series3.title} (4 集)`)
  console.log(`- 创建了 3 张卡牌`)
}

main()
  .catch((e) => {
    console.error("❌ 生成失败:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
