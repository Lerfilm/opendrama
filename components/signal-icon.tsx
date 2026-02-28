"use client"

/**
 * WiFi-like 3-bar signal strength icon.
 * Bars are colored when `available`, all gray when not.
 * `signal` (1-3) controls how many bars are lit.
 */
export function SignalIcon({ signal, available, size = 14 }: { signal: 1 | 2 | 3; available: boolean; size?: number }) {
  const activeColor = "#22C55E" // green-500
  const dimColor = "#D1D5DB"    // gray-300

  const barColor = (barLevel: number) => {
    if (!available) return dimColor
    return signal >= barLevel ? activeColor : dimColor
  }

  // 3 bars: short, medium, tall — left to right
  const barWidth = size * 0.2
  const gap = size * 0.1
  const totalWidth = barWidth * 3 + gap * 2

  return (
    <svg
      width={totalWidth}
      height={size}
      viewBox={`0 0 ${totalWidth} ${size}`}
      fill="none"
      className="inline-block shrink-0"
    >
      {/* Bar 1 — short */}
      <rect
        x={0}
        y={size * 0.6}
        width={barWidth}
        height={size * 0.4}
        rx={1}
        fill={barColor(1)}
      />
      {/* Bar 2 — medium */}
      <rect
        x={barWidth + gap}
        y={size * 0.3}
        width={barWidth}
        height={size * 0.7}
        rx={1}
        fill={barColor(2)}
      />
      {/* Bar 3 — tall */}
      <rect
        x={(barWidth + gap) * 2}
        y={0}
        width={barWidth}
        height={size}
        rx={1}
        fill={barColor(3)}
      />
    </svg>
  )
}
