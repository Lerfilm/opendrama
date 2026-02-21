/**
 * Migration: Add creator/director info to Series model
 * Adds userId, scriptId, synopsis, coverTall, coverWide to series table
 * Backfills from scripts table using metadata.publishedSeriesId
 */
import { Pool } from "pg"
import { config } from "dotenv"

config({ path: ".env.local" })

const DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })

  try {
    console.log("Starting migration: Series creator fields...")

    // Add new columns
    await pool.query(`
      ALTER TABLE series ADD COLUMN IF NOT EXISTS "userId" TEXT;
      ALTER TABLE series ADD COLUMN IF NOT EXISTS "scriptId" TEXT;
      ALTER TABLE series ADD COLUMN IF NOT EXISTS synopsis TEXT;
      ALTER TABLE series ADD COLUMN IF NOT EXISTS "coverTall" TEXT;
      ALTER TABLE series ADD COLUMN IF NOT EXISTS "coverWide" TEXT;
    `)
    console.log("✅ Added columns: userId, scriptId, synopsis, coverTall, coverWide")

    // Add foreign key constraints (ignore if already exist)
    try {
      await pool.query(`ALTER TABLE series ADD CONSTRAINT fk_series_user FOREIGN KEY ("userId") REFERENCES users(id);`)
      console.log("✅ Added FK: series.userId -> users.id")
    } catch { console.log("⚠️  FK series.userId already exists, skipping") }

    try {
      await pool.query(`ALTER TABLE series ADD CONSTRAINT fk_series_script FOREIGN KEY ("scriptId") REFERENCES scripts(id);`)
      console.log("✅ Added FK: series.scriptId -> scripts.id")
    } catch { console.log("⚠️  FK series.scriptId already exists, skipping") }

    // Add unique constraint on scriptId
    try {
      await pool.query(`ALTER TABLE series ADD CONSTRAINT uq_series_script_id UNIQUE ("scriptId");`)
      console.log("✅ Added unique constraint on series.scriptId")
    } catch { console.log("⚠️  Unique constraint on scriptId already exists, skipping") }

    // Add index on userId
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_series_user_id ON series("userId");`)
    console.log("✅ Created index idx_series_user_id")

    // Backfill from scripts table
    const backfillResult = await pool.query(`
      UPDATE series SET
        "userId" = s."userId",
        "scriptId" = s.id,
        synopsis = s.synopsis,
        "coverTall" = s."coverTall",
        "coverWide" = s."coverWide"
      FROM scripts s
      WHERE s.metadata IS NOT NULL
        AND s.metadata LIKE '%publishedSeriesId%'
        AND s.metadata::jsonb->>'publishedSeriesId' = series.id
        AND series."userId" IS NULL
    `)
    console.log(`✅ Backfilled ${backfillResult.rowCount} series with creator data`)

    // Verify
    const { rows } = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT("userId") as with_user,
        COUNT("scriptId") as with_script
      FROM series
    `)
    console.log(`📊 Series stats: total=${rows[0].total}, with_user=${rows[0].with_user}, with_script=${rows[0].with_script}`)

    console.log("\n🎉 Migration complete!")
  } catch (err) {
    console.error("Migration failed:", err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
