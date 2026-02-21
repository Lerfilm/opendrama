import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres.ttkbptrovgrxyodiojno:5FCn6mhzLh3zPGzR@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  ssl: { rejectUnauthorized: false },
})

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Series new columns
    await client.query(`ALTER TABLE series ADD COLUMN IF NOT EXISTS genre TEXT`)
    await client.query(`ALTER TABLE series ADD COLUMN IF NOT EXISTS tags TEXT`)
    await client.query(`ALTER TABLE series ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0`)
    console.log("✓ Series columns added")

    // Series Likes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS series_likes (
        id TEXT PRIMARY KEY,
        "seriesId" TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE("userId", "seriesId")
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_series_likes_series ON series_likes("seriesId")`)
    console.log("✓ series_likes table created")

    // Series Favorites table
    await client.query(`
      CREATE TABLE IF NOT EXISTS series_favorites (
        id TEXT PRIMARY KEY,
        "seriesId" TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE("userId", "seriesId")
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_series_favorites_series ON series_favorites("seriesId")`)
    console.log("✓ series_favorites table created")

    // Series Ratings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS series_ratings (
        id TEXT PRIMARY KEY,
        "seriesId" TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE("userId", "seriesId")
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_series_ratings_series ON series_ratings("seriesId")`)
    console.log("✓ series_ratings table created")

    // Series Comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS series_comments (
        id TEXT PRIMARY KEY,
        "seriesId" TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_series_comments_series ON series_comments("seriesId", "createdAt" DESC)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_series_comments_user ON series_comments("userId")`)
    console.log("✓ series_comments table created")

    // Set default genre for existing series
    await client.query(`UPDATE series SET genre = 'drama' WHERE genre IS NULL`)
    console.log("✓ Default genre set")

    await client.query("COMMIT")
    console.log("\n🎉 V0.5 migration complete!")
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("Migration failed:", e)
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
