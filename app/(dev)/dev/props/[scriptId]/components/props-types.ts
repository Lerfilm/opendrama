export interface PropPhoto {
  url: string
  note?: string
  isApproved?: boolean
}

export interface PropItem {
  id: string
  name: string
  category: string
  description?: string
  sceneIds: string[]
  photos: PropPhoto[]
  isKey: boolean
  quantity?: number
  source?: string
  notes?: string
}

export const PROP_CATEGORIES = [
  { value: "furniture", label: "🪑 Furniture", color: "#D97706" },
  { value: "wardrobe", label: "👔 Wardrobe", color: "#7C3AED" },
  { value: "vehicle", label: "🚗 Vehicle", color: "#2563EB" },
  { value: "food", label: "🍽 Food & Drink", color: "#16A34A" },
  { value: "weapon", label: "🗡 Weapon", color: "#DC2626" },
  { value: "electronic", label: "📱 Electronic", color: "#0891B2" },
  { value: "document", label: "📄 Document/Book", color: "#92400E" },
  { value: "other", label: "📦 Other", color: "#6B7280" },
]

export const SOURCE_OPTIONS = [
  { value: "rent", label: "Rent 租借" },
  { value: "buy", label: "Buy 购买" },
  { value: "make", label: "Make/Custom 定制" },
  { value: "found", label: "Found/On Location 现场取用" },
]

export function getCategoryStyle(cat: string) {
  return PROP_CATEGORIES.find(c => c.value === cat) || PROP_CATEGORIES[PROP_CATEGORIES.length - 1]
}
