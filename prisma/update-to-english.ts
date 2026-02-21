import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres.ttkbptrovgrxyodiojno:5FCn6mhzLh3zPGzR@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  ssl: { rejectUnauthorized: false },
})

// Series: Chinese title → English title + description
const seriesUpdates: Record<string, { title: string; description: string }> = {
  "都市逆袭": {
    title: "Urban Rise",
    description: "A down-on-his-luck young man gains a mysterious system and begins his journey from street vendor to business empire builder.",
  },
  "重生千金": {
    title: "Reborn Heiress",
    description: "Betrayed and killed in her past life, a wealthy heiress is reborn 10 years earlier — this time, she fights back.",
  },
  "龙王归来": {
    title: "Dragon King Returns",
    description: "After enduring three years as a stay-at-home husband, his true identity as heir to the Dragon Group is finally revealed.",
  },
  "闪婚总裁": {
    title: "Flash Marriage CEO",
    description: "To escape a blind date, she grabs a stranger to get married — only to discover he's the city's most powerful CEO.",
  },
  "医妃惊天下": {
    title: "The Royal Physician",
    description: "A modern genius doctor is transported to ancient times as a disgraced princess, shaking up the imperial court with her skills.",
  },
  "至尊兵王": {
    title: "Supreme Warrior",
    description: "A legendary special forces soldier returns to civilian life, but keeps getting dragged into dangerous conspiracies.",
  },
}

// Episode titles: Chinese series title → English episode titles
const episodeUpdates: Record<string, string[]> = {
  "都市逆袭": ["The System Awakens", "First Fortune", "Corporate Storm", "A Powerful Rival", "The Counterattack", "Undercurrents", "Alliance of Power", "The Summit Battle", "A New Journey", "Empire Rising"],
  "重生千金": ["Back to Ten Years Ago", "Step by Step", "The Real Heiress", "Revenge Begins", "Business Warfare", "Old Flame Returns", "A Shocking Secret", "The Final Showdown", "Truth Revealed", "Phoenix Reborn", "A New Life", "Perfect Ending"],
  "龙王归来": ["Three Years of Patience", "Identity Exposed", "Shocking Everyone", "The Dragon's Fury", "Business Empire", "Family Secrets", "The King Returns", "Final Battle"],
  "闪婚总裁": ["The Flash Wedding", "Living Together", "Identity Revealed", "Sweet Misunderstandings", "The Ex Returns", "True Confession", "Elite Family Drama", "Happy Ending", "Bonus Episode"],
  "医妃惊天下": ["Journey to the Past", "Medical Talent Emerges", "Palace Intrigues", "Court Conspiracies", "The Plague Crisis", "Divine Healer's Fame", "Imperial Plot", "Turning the Tide", "Winning the World", "A Prosperous Era"],
  "至尊兵王": ["The Warrior Returns", "Entering the City", "Night Pursuit", "Underground Forces", "Life or Death Battle", "Truth Surfaces", "The Final Mission", "Return to Peace", "A New Life", "Hero's Curtain Call", "Post-Credits", "Side Story I", "Side Story II", "Side Story III", "Side Story IV", "The Finale"],
}

// Card names
const cardNameMap: Record<string, string> = {
  "角色卡": "Character Card",
  "系列收藏卡牌": "Series Collectible Card",
}

async function updateToEnglish() {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Update series titles and descriptions
    for (const [zhTitle, enData] of Object.entries(seriesUpdates)) {
      const result = await client.query(
        `UPDATE series SET title = $1, description = $2, "updatedAt" = NOW() WHERE title = $3 RETURNING id`,
        [enData.title, enData.description, zhTitle]
      )
      if (result.rowCount && result.rowCount > 0) {
        console.log(`  ✓ Series: ${zhTitle} → ${enData.title}`)

        // Update episode titles for this series
        const seriesId = result.rows[0].id
        const epTitles = episodeUpdates[zhTitle] || []
        for (let i = 0; i < epTitles.length; i++) {
          await client.query(
            `UPDATE episodes SET title = $1, "updatedAt" = NOW() WHERE "seriesId" = $2 AND "episodeNum" = $3`,
            [epTitles[i], seriesId, i + 1]
          )
        }
        console.log(`    → Updated ${epTitles.length} episode titles`)

        // Update episode unlockCost: first 5 episodes free
        await client.query(
          `UPDATE episodes SET "unlockCost" = 0, "updatedAt" = NOW() WHERE "seriesId" = $1 AND "episodeNum" <= 5`,
          [seriesId]
        )
        console.log(`    → Set first 5 episodes free`)
      } else {
        console.log(`  ⚠ Series not found: ${zhTitle}`)
      }
    }

    // Update card names
    const cards = await client.query(`SELECT id, name, description FROM cards`)
    for (const card of cards.rows) {
      let newName = card.name
      let newDesc = card.description
      // Replace Chinese series names in card names
      for (const [zh, en] of Object.entries(seriesUpdates)) {
        newName = newName.replace(zh, en.title)
        newDesc = newDesc?.replace(zh, en.title) || newDesc
      }
      // Replace Chinese terms
      newName = newName.replace("角色卡", "Character Card")
      newDesc = newDesc?.replace("系列收藏卡牌", "Series Collectible Card") || newDesc

      if (newName !== card.name || newDesc !== card.description) {
        await client.query(
          `UPDATE cards SET name = $1, description = $2, "updatedAt" = NOW() WHERE id = $3`,
          [newName, newDesc, card.id]
        )
      }
    }
    console.log(`  ✓ Updated card names to English`)

    await client.query("COMMIT")
    console.log("\n🎉 Database updated to English!")
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("Update failed:", e)
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

updateToEnglish()
