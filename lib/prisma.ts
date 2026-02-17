import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>
} & typeof global

// Use a getter to lazy-initialize
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalThis.prismaGlobal) {
      globalThis.prismaGlobal = prismaClientSingleton()
    }
    return (globalThis.prismaGlobal as any)[prop]
  },
})

export default prisma
