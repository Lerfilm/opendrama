import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres.ttkbptrovgrxyodiojno:5FCn6mhzLh3zPGzR@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
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

    // Create 6 series
    const seriesData = [
      {
        id: cuid(),
        title: "Urban Rise",
        description: "A down-on-his-luck young man gains a mysterious system and begins his journey from street vendor to business empire builder.",
        coverUrl: "https://picsum.photos/seed/drama1/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "Reborn Heiress",
        description: "Betrayed and killed in her past life, a wealthy heiress is reborn 10 years earlier — this time, she fights back.",
        coverUrl: "https://picsum.photos/seed/drama2/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "Dragon King Returns",
        description: "After enduring three years as a stay-at-home husband, his true identity as heir to the Dragon Group is finally revealed.",
        coverUrl: "https://picsum.photos/seed/drama3/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "Flash Marriage CEO",
        description: "To escape a blind date, she grabs a stranger to get married — only to discover he's the city's most powerful CEO.",
        coverUrl: "https://picsum.photos/seed/drama4/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "The Royal Physician",
        description: "A modern genius doctor is transported to ancient times as a disgraced princess, shaking up the imperial court with her skills.",
        coverUrl: "https://picsum.photos/seed/drama5/400/600",
        status: "active",
      },
      {
        id: cuid(),
        title: "Supreme Warrior",
        description: "A legendary special forces soldier returns to civilian life, but keeps getting dragged into dangerous conspiracies.",
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
      "Urban Rise": ["The System Awakens", "First Fortune", "Corporate Storm", "A Powerful Rival", "The Counterattack", "Undercurrents", "Alliance of Power", "The Summit Battle", "A New Journey", "Empire Rising"],
      "Reborn Heiress": ["Back to Ten Years Ago", "Step by Step", "The Real Heiress", "Revenge Begins", "Business Warfare", "Old Flame Returns", "A Shocking Secret", "The Final Showdown", "Truth Revealed", "Phoenix Reborn", "A New Life", "Perfect Ending"],
      "Dragon King Returns": ["Three Years of Patience", "Identity Exposed", "Shocking Everyone", "The Dragon's Fury", "Business Empire", "Family Secrets", "The King Returns", "Final Battle"],
      "Flash Marriage CEO": ["The Flash Wedding", "Living Together", "Identity Revealed", "Sweet Misunderstandings", "The Ex Returns", "True Confession", "Elite Family Drama", "Happy Ending", "Bonus Episode"],
      "The Royal Physician": ["Journey to the Past", "Medical Talent Emerges", "Palace Intrigues", "Court Conspiracies", "The Plague Crisis", "Divine Healer's Fame", "Imperial Plot", "Turning the Tide", "Winning the World", "A Prosperous Era"],
      "Supreme Warrior": ["The Warrior Returns", "Entering the City", "Night Pursuit", "Underground Forces", "Life or Death Battle", "Truth Surfaces", "The Final Mission", "Return to Peace", "A New Life", "Hero's Curtain Call", "Post-Credits", "Side Story I", "Side Story II", "Side Story III", "Side Story IV", "The Finale"],
    }

    let totalEpisodes = 0
    for (const s of seriesData) {
      const titles = episodeTitles[s.title] || []
      for (let i = 0; i < titles.length; i++) {
        const epId = cuid()
        const duration = 180 + Math.floor(Math.random() * 420) // 3-10 min
        const unlockCost = i < 5 ? 0 : [5, 8, 10, 15][Math.floor(Math.random() * 4)]
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
            `${s.title} - Character Card ${i + 1}`,
            rarity,
            `https://picsum.photos/seed/card${s.id}${i}/300/400`,
            `${s.title} Series Collectible Card`,
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

    // Create some purchases for analytics (USD cents)
    const packages = [
      { amount: 99, coins: 60 },
      { amount: 499, coins: 300 },
      { amount: 1499, coins: 1000 },
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
