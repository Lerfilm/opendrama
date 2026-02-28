import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface SeriesTagsProps {
  genre?: string | null
  tags?: string | null  // JSON string
}

export default function SeriesTags({ genre, tags }: SeriesTagsProps) {
  let tagList: string[] = []
  try {
    if (tags) tagList = JSON.parse(tags)
  } catch {}

  // Filter out tags that duplicate the genre (case-insensitive)
  const genreLower = genre?.toLowerCase() || ""
  tagList = tagList.filter(tag => tag.toLowerCase() !== genreLower)

  if (!genre && tagList.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {genre && (
        <Link href={`/discover?genre=${genre}`}>
          <Badge variant="secondary" className="text-xs capitalize cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 transition-colors">
            {genre}
          </Badge>
        </Link>
      )}
      {tagList.map((tag) => (
        <Link key={tag} href={`/discover?tag=${encodeURIComponent(tag)}`}>
          <Badge variant="outline" className="text-xs cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors">
            {tag}
          </Badge>
        </Link>
      ))}
    </div>
  )
}
