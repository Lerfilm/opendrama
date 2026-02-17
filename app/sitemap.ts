export const dynamic = "force-dynamic";
import { MetadataRoute } from "next"
import prisma from "@/lib/prisma"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXTAUTH_URL || "https://dramabox.ai"

  const seriesList = await prisma.series.findMany({
    where: { status: "active" },
    select: { id: true, updatedAt: true },
  })

  const seriesEntries: MetadataRoute.Sitemap = seriesList.map((s) => ({
    url: `${baseUrl}/series/${s.id}`,
    lastModified: s.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }))

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/discover`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...seriesEntries,
  ]
}
