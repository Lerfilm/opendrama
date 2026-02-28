import Link from "next/link"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    href: string
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className || ""}`}>
      {/* Icon container with decorative background */}
      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
          <div className="text-muted-foreground/60">{icon}</div>
        </div>
        {/* Decorative dots */}
        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-muted-foreground/10" />
        <div className="absolute -bottom-1 -left-1 w-1.5 h-1.5 rounded-full bg-muted-foreground/10" />
      </div>

      <h3 className="text-sm font-semibold text-foreground mb-1">
        {title}
      </h3>

      {description && (
        <p className="text-xs text-muted-foreground max-w-[240px] mb-4">
          {description}
        </p>
      )}

      {action && (
        <Button asChild size="sm" className="rounded-full px-5">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}
