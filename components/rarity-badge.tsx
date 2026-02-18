interface RarityBadgeProps {
  dotColor: string
  name: string
  className?: string
}

export function RarityBadge({ dotColor, name, className }: RarityBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${className || ""}`}>
      <span
        className="inline-block w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      {name}
    </span>
  )
}
