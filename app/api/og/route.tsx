import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"

export const runtime = "edge"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get("title") || "OpenDrama"
  const genre = searchParams.get("genre") || ""
  const episodes = searchParams.get("episodes") || ""
  const ep = searchParams.get("ep") || ""

  const genreColors: Record<string, string> = {
    romance: "#DB2777",
    thriller: "#475569",
    fantasy: "#7C3AED",
    comedy: "#D97706",
    drama: "#2563EB",
    horror: "#DC2626",
    action: "#EA580C",
    mystery: "#059669",
  }

  const bgColor = genreColors[genre.toLowerCase()] || "#1E293B"

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px",
          background: `linear-gradient(135deg, ${bgColor} 0%, #0F172A 100%)`,
          fontFamily: "sans-serif",
        }}
      >
        {/* Top right: OpenDrama logo */}
        <div
          style={{
            position: "absolute",
            top: "40px",
            right: "60px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #F97316, #EAB308)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            🎬
          </div>
          <span style={{ color: "white", fontSize: "24px", fontWeight: "bold", opacity: 0.8 }}>
            OpenDrama
          </span>
        </div>

        {/* Episode tag */}
        {ep && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.15)",
                borderRadius: "20px",
                padding: "6px 16px",
                color: "white",
                fontSize: "20px",
                fontWeight: "600",
              }}
            >
              Episode {ep}
            </div>
          </div>
        )}

        {/* Title */}
        <div
          style={{
            fontSize: "64px",
            fontWeight: "900",
            color: "white",
            lineHeight: 1.1,
            marginBottom: "20px",
            maxWidth: "80%",
          }}
        >
          {title}
        </div>

        {/* Meta line */}
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          {genre && (
            <div
              style={{
                background: "rgba(255,255,255,0.2)",
                borderRadius: "6px",
                padding: "4px 12px",
                color: "white",
                fontSize: "18px",
                fontWeight: "600",
              }}
            >
              {genre}
            </div>
          )}
          {episodes && (
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "18px" }}>
              {episodes} episodes
            </span>
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
