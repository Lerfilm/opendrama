import { Badge } from "@/components/ui/badge"
import { t } from "@/lib/i18n"
import Image from "next/image"

interface Role {
  id: string
  name: string
  role: string
  description: string | null
  avatarUrl: string | null
}

const roleBadgeColors: Record<string, string> = {
  protagonist: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  antagonist: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  supporting: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  minor: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
}

const roleLabels: Record<string, string> = {
  protagonist: "series.protagonist",
  antagonist: "series.antagonist",
  supporting: "series.supporting",
  minor: "series.minor",
}

export default function CastSection({ roles }: { roles: Role[] }) {
  if (!roles || roles.length === 0) return null

  return (
    <div className="px-4 py-3">
      <h3 className="text-sm font-semibold mb-3">{t("series.cast")}</h3>
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {roles.map((role) => (
          <div
            key={role.id}
            className="flex flex-col items-center gap-1.5 shrink-0 w-[72px]"
          >
            {/* Avatar */}
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted border-2 border-background shadow-sm">
              {role.avatarUrl ? (
                <Image
                  src={role.avatarUrl}
                  alt={role.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground bg-gradient-to-br from-muted to-muted/50">
                  {role.name[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>

            {/* Name */}
            <p className="text-[11px] font-medium text-center leading-tight line-clamp-2">
              {role.name}
            </p>

            {/* Role badge */}
            <Badge
              className={`text-[9px] px-1.5 py-0 ${roleBadgeColors[role.role] || roleBadgeColors.minor}`}
            >
              {t(roleLabels[role.role] || "series.minor")}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}
