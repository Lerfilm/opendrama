/**
 * Genre-based gradient colors for series cards without covers.
 * Returns Tailwind gradient classes for bg-gradient-to-br.
 */
export function getGenreGradient(genre?: string | null): string {
  switch (genre?.toLowerCase()) {
    case "romance":
      return "from-pink-800 to-rose-900"
    case "thriller":
      return "from-slate-800 to-zinc-900"
    case "fantasy":
      return "from-violet-800 to-purple-900"
    case "comedy":
      return "from-amber-700 to-orange-800"
    case "drama":
      return "from-blue-800 to-indigo-900"
    case "horror":
      return "from-gray-900 to-red-950"
    case "action":
      return "from-red-800 to-orange-900"
    case "mystery":
      return "from-emerald-800 to-teal-900"
    default:
      return "from-stone-800 to-stone-900"
  }
}

/**
 * Genre icon emoji for cover fallback display
 */
export function getGenreIcon(genre?: string | null): string {
  switch (genre?.toLowerCase()) {
    case "romance":
      return "\u2764\ufe0f"
    case "thriller":
      return "\ud83d\udd2a"
    case "fantasy":
      return "\u2728"
    case "comedy":
      return "\ud83d\ude02"
    case "drama":
      return "\ud83c\udfad"
    case "horror":
      return "\ud83d\udc7b"
    case "action":
      return "\ud83d\udca5"
    case "mystery":
      return "\ud83d\udd0d"
    default:
      return "\ud83c\udfac"
  }
}
