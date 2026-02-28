import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const dbUrl = (process.env.DATABASE_URL || "").replace(":6543/", ":5432/").replace("?pgbouncer=true", "")
const pool = new Pool({ connectionString: dbUrl })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
})
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "")

async function run() {
  const prompt = "Cinematic 9:16 vertical poster for a romance drama. A stunningly beautiful young woman in a simple white dress stands face-to-face with a tall, handsome man in a perfectly tailored black suit. Manhattan skyline at night with golden bokeh lights behind them. Their faces inches apart, intense eye contact, sexual tension. Dramatic rim lighting, warm golden tones, shallow depth of field. Ultra-realistic, photographic quality, 8K, professional movie poster lighting."

  console.log("Generating poster for The Billionaire's Secret Wife...")
  const res = await fetch("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "doubao-seedream-4-5-251128", prompt, size: "1440x2560", n: 1 }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`Seedream ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const img = data.data?.[0]
  if (!img) throw new Error("No image data")

  const buffer = img.b64_json
    ? Buffer.from(img.b64_json, "base64")
    : Buffer.from(await (await fetch(img.url!)).arrayBuffer())

  const key = "covers/seed-the-billionaires-secret-wife-tall.png"
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    ContentType: "image/png",
  }))
  const url = `${R2_PUBLIC_URL}/${key}`

  await prisma.series.updateMany({
    where: { title: "The Billionaire's Secret Wife" },
    data: { coverTall: url, coverUrl: url },
  })
  console.log(`✅ Done! ${(buffer.length / 1024).toFixed(0)}KB uploaded → ${url}`)
  await prisma.$disconnect()
  await pool.end()
}

run().catch(e => { console.error("❌", e.message); process.exit(1) })
