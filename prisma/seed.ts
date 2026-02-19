import { Pool } from "pg"

const pool = new Pool({
  host: "aws-1-us-west-1.pooler.supabase.com",
  port: 6543,
  database: "postgres",
  user: "postgres.ttkbptrovgrxyodiojno",
  password: "FKrzId6Uu5U4uHaf",
  ssl: { rejectUnauthorized: false },
})

function cuid() {
  return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function seed() {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Check if data already exists
    const existing = await client.query("SELECT COUNT(*) FROM series")
    if (parseInt(existing.rows[0].count) > 0) {
      console.log("Data already exists, clearing...")
      await client.query("DELETE FROM watch_events")
      await client.query("DELETE FROM episode_unlocks")
      await client.query("DELETE FROM user_cards")
      await client.query("DELETE FROM cards")
      await client.query("DELETE FROM episodes")
      await client.query("DELETE FROM series")
      await client.query("DELETE FROM purchases")
    }

    // Create 6 series with Chinese drama themes
    const seriesData = [
      {
        id: cuid(),
        title: "都市逆袭",
        description: "落魄青年意外获得神秘系统，从此走上逆袭之路。从街边小摊到商业帝国，每一步都惊心动魄。",
        coverUrl: "https://picsum.photos/seed/drama1/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "重生千金",
        description: "前世被害身亡的千金小姐重生回到十年前，这一次她要改变命运，守护家人，向所有背叛者复仇。",
        coverUrl: "https://picsum.photos/seed/drama2/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "龙王归来",
        description: "隐忍三年的上门女婿，真实身份竟是龙王集团继承人。当他不再隐藏，整个城市都将为之颤抖。",
        coverUrl: "https://picsum.photos/seed/drama3/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "闪婚总裁",
        description: "为了逃避相亲，她随手拉了个路人领证。没想到这个路人竟是全城最神秘的霸道总裁。",
        coverUrl: "https://picsum.photos/seed/drama4/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "医妃惊天下",
        description: "现代天才女医穿越古代，成为被退婚的废材郡主。凭一手神医术，搅动朝堂风云。",
        coverUrl: "https://picsum.photos/seed/drama5/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "至尊兵王",
        description: "战场上的传奇兵王回归都市，本想低调生活，却被卷入一场场惊天阴谋之中。",
        coverUrl: "https://picsum.photos/seed/drama6/400/600",
        status: "completed",
      },
    ]

    for (const s of seriesData) {
      await client.query(
        `INSERT INTO series (id, title, description, "coverUrl", status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [s.id, s.title, s.description, s.coverUrl, s.status]
      )
      console.log(`  ✓ Series: ${s.title}`)
    }

    // Create episodes for each series (8-16 episodes each)
    const episodeTitles: Record<string, string[]> = {
      都市逆袭: ["初遇系统", "第一桶金", "商场风云", "强敌来袭", "绝地反击", "暗潮涌动", "合纵连横", "巅峰对决", "新的征程", "帝国崛起"],
      重生千金: ["重回十年前", "步步为营", "真假千金", "复仇开始", "商战博弈", "旧爱重逢", "惊天秘密", "终极对决", "真相大白", "凤凰涅槃", "新的人生", "完美结局"],
      龙王归来: ["隐忍三年", "身份暴露", "震惊全场", "龙王之怒", "商业帝国", "家族秘辛", "王者归来", "最终决战"],
      闪婚总裁: ["闪婚风波", "同居日常", "身份曝光", "甜蜜误解", "前任来袭", "真心告白", "豪门风波", "幸福结局", "番外篇"],
      医妃惊天下: ["穿越古代", "初显医术", "王府风云", "朝堂暗涌", "瘟疫危机", "神医之名", "宫廷阴谋", "逆转乾坤", "天下归心", "盛世太平"],
      至尊兵王: ["兵王归来", "初入都市", "暗夜追踪", "地下势力", "生死对决", "真相浮出", "最终任务", "和平归来", "新的生活", "英雄落幕", "彩蛋篇", "番外一", "番外二", "番外三", "番外四", "终章"],
    }

    let totalEpisodes = 0
    for (const s of seriesData) {
      const titles = episodeTitles[s.title] || []
      for (let i = 0; i < titles.length; i++) {
        const epId = cuid()
        const duration = 180 + Math.floor(Math.random() * 420) // 3-10 min
        const unlockCost = i === 0 ? 0 : [5, 8, 10, 15][Math.floor(Math.random() * 4)]
        await client.query(
          `INSERT INTO episodes (id, "seriesId", "episodeNum", title, duration, "unlockCost", status, "createdAt", "updatedAt") 
           VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())`,
          [epId, s.id, i + 1, titles[i], duration, unlockCost]
        )
        totalEpisodes++
      }
    }
    console.log(`  ✓ Episodes: ${totalEpisodes} total`)

    // Create cards for some series
    const rarities = ["common", "common", "common", "rare", "rare", "epic", "legendary"]
    let totalCards = 0
    for (const s of seriesData.slice(0, 4)) {
      const numCards = 3 + Math.floor(Math.random() * 4)
      for (let i = 0; i < numCards; i++) {
        const cardId = cuid()
        const rarity = rarities[Math.floor(Math.random() * rarities.length)]
        await client.query(
          `INSERT INTO cards (id, "seriesId", name, rarity, "imageUrl", description, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            cardId,
            s.id,
            `${s.title} - 角色卡${i + 1}`,
            rarity,
            `https://picsum.photos/seed/card${s.id}${i}/300/400`,
            `${s.title}系列收藏卡牌`,
          ]
        )
        totalCards++
      }
    }
    console.log(`  ✓ Cards: ${totalCards} total`)

    // Create a demo user
    const demoUserId = cuid()
    await client.query(
      `INSERT INTO users (id, name, email, coins, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET coins = $4, "updatedAt" = NOW()
       RETURNING id`,
      [demoUserId, "Demo User", "demo@opendrama.ai", 500]
    )
    console.log(`  ✓ Demo user: demo@opendrama.ai (500 coins)`)

    // Create some watch events for analytics
    const episodes = await client.query(`SELECT id, "seriesId" FROM episodes LIMIT 20`)
    let watchCount = 0
    for (const ep of episodes.rows) {
      const numWatches = Math.floor(Math.random() * 5) + 1
      for (let i = 0; i < numWatches; i++) {
        const daysAgo = Math.floor(Math.random() * 30)
        const watchDuration = 60 + Math.floor(Math.random() * 300)
        await client.query(
          `INSERT INTO watch_events (id, "userId", "episodeId", "watchPosition", "watchDuration", "completedRate", source, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - interval '${daysAgo} days')`,
          [cuid(), demoUserId, ep.id, watchDuration, watchDuration, Math.random(), "web"]
        )
        watchCount++
      }
    }
    console.log(`  ✓ Watch events: ${watchCount}`)

    // Create some purchases for analytics
    const packages = [
      { amount: 600, coins: 60 },
      { amount: 1800, coins: 200 },
      { amount: 4500, coins: 550 },
    ]
    for (let i = 0; i < 8; i++) {
      const pkg = packages[Math.floor(Math.random() * packages.length)]
      const daysAgo = Math.floor(Math.random() * 30)
      await client.query(
        `INSERT INTO purchases (id, "userId", "stripeSessionId", amount, coins, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'completed', NOW() - interval '${daysAgo} days', NOW())`,
        [cuid(), demoUserId, `cs_demo_${cuid()}`, pkg.amount, pkg.coins]
      )
    }
    console.log(`  ✓ Purchases: 8`)

    await client.query("COMMIT")
    console.log("\n🎉 Seed complete!")
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("Seed failed:", e)
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
