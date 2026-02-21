import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "OpenDrama - Short Dramas Anytime",
    template: "%s | OpenDrama",
  },
  description: "OpenDrama is an AI-powered short drama platform. Watch amazing short dramas anytime, anywhere.",
  keywords: ["short drama", "OpenDrama", "video", "streaming", "AI drama", "web series"],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "OpenDrama",
    title: "OpenDrama - Short Dramas Anytime",
    description: "OpenDrama is an AI-powered short drama platform. Watch amazing short dramas anytime, anywhere.",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenDrama - Short Dramas Anytime",
    description: "OpenDrama is an AI-powered short drama platform. Watch amazing short dramas anytime, anywhere.",
  },
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#4f46e5",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
