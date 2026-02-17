import { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXTAUTH_URL || "https://dramabox.ai"

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/auth/", "/profile/", "/recharge/", "/purchases/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
