import { readFileSync } from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)

const envLocal = readFileSync(new URL("/Users/lerfilm/opendrama-repo/.env.local", import.meta.url), "utf8")
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([^#=][^=]*)=(.*)$/)
  if (m) {
    const key = m[1].trim()
    const val = m[2].trim().replace(/^["']|["']$/g, "")
    if (!process.env[key]) process.env[key] = val
  }
}
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

const { PrismaClient } = require("@prisma/client")
const { PrismaPg } = require("@prisma/adapter-pg")
const { Pool } = require("pg")
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const segs = await prisma.videoSegment.findMany({
  where: { status: "done", videoUrl: { not: null } },
  select: { id: true, videoUrl: true, model: true },
  take: 3,
})
console.log(JSON.stringify(segs, null, 2))
await prisma.$disconnect()
