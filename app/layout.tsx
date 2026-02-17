import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "DramaBox - 精彩短剧随时看",
    template: "%s | DramaBox",
  },
  description: "DramaBox 是专注短剧内容的视频平台，海量精彩短剧随时随地观看。",
  keywords: ["短剧", "DramaBox", "视频", "在线观看", "热门短剧"],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "DramaBox",
    title: "DramaBox - 精彩短剧随时看",
    description: "DramaBox 是专注短剧内容的视频平台，海量精彩短剧随时随地观看。",
  },
  twitter: {
    card: "summary_large_image",
    title: "DramaBox - 精彩短剧随时看",
    description: "DramaBox 是专注短剧内容的视频平台，海量精彩短剧随时随地观看。",
  },
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#7c3aed",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  )
}
