/**
 * AI Feature Pricing — server-side helpers.
 * Reads from DB (AiFeaturePrice), with hardcoded defaults as fallback.
 */
import prisma from "@/lib/prisma"
import { directDeduction } from "@/lib/tokens"

/** All known AI feature keys */
export type AiFeatureKey =
  | "extract_props"
  | "extract_locations"
  | "describe_location"
  | "generate_script"
  | "import_pdf"
  | "adapt_prompt"
  | "generate_character"
  | "generate_costume"
  | "generate_prop_photo"
  | "generate_location_photo"
  | "generate_cover"
  | "fill_character_specs"
  | "ai_suggest"
  | "ai_stitch"
  | "ai_split"
  | "ai_polish"

/** Default coin costs when DB row not found */
export const DEFAULT_AI_PRICES: Record<AiFeatureKey, { label: string; costCoins: number; description: string }> = {
  extract_props:       { label: "Props AI Extract",       costCoins: 2,  description: "AI extracts all props from screenplay" },
  extract_locations:   { label: "Location AI Extract",    costCoins: 2,  description: "AI extracts filming locations with time slots" },
  describe_location:   { label: "Location AI Describe",   costCoins: 1,  description: "AI generates location scout notes" },
  generate_script:     { label: "Script AI Generate",     costCoins: 5,  description: "AI generates scene content (varies with length)" },
  import_pdf:          { label: "PDF Import",             costCoins: 5,  description: "AI parses full screenplay PDF (per episode)" },
  adapt_prompt:        { label: "Prompt Adapt",           costCoins: 1,  description: "AI adapts video generation prompt" },
  generate_character:  { label: "Character Generate",     costCoins: 3,  description: "AI generates character portrait" },
  generate_costume:    { label: "Costume Generate",      costCoins: 2,  description: "AI generates costume reference image" },
  generate_prop_photo: { label: "Prop Photo Generate",   costCoins: 2,  description: "AI generates prop reference photo" },
  generate_location_photo: { label: "Location Photo",    costCoins: 2,  description: "AI generates location reference photo" },
  generate_cover:      { label: "Cover Generate",        costCoins: 2,  description: "AI generates episode cover image" },
  fill_character_specs:{ label: "Character Specs Fill",   costCoins: 1,  description: "AI auto-fills character casting specs" },
  ai_suggest:          { label: "Scene Suggestions",      costCoins: 1,  description: "AI suggests scene improvements" },
  ai_stitch:           { label: "Script Stitch",          costCoins: 1,  description: "AI stitches script sections" },
  ai_split:            { label: "Script Split",           costCoins: 1,  description: "AI splits script into episodes" },
  ai_polish:           { label: "Script Polish",          costCoins: 2,  description: "AI polishes script language" },
}

/**
 * Get the coin cost for a feature (from DB, fallback to default).
 */
export async function getFeatureCost(featureKey: AiFeatureKey): Promise<number> {
  try {
    const row = await prisma.aiFeaturePrice.findUnique({ where: { featureKey } })
    if (row && row.enabled) return row.costCoins
    // If not found in DB, seed it and return default
    const def = DEFAULT_AI_PRICES[featureKey]
    if (!row) {
      await prisma.aiFeaturePrice.upsert({
        where: { featureKey },
        update: {},
        create: {
          featureKey,
          label: def.label,
          costCoins: def.costCoins,
          description: def.description,
          enabled: true,
        },
      }).catch(() => {}) // ignore race condition errors
    }
    return def.costCoins
  } catch {
    return DEFAULT_AI_PRICES[featureKey]?.costCoins ?? 1
  }
}

/**
 * Charge a user for an AI feature.
 * Returns { ok: true } or { ok: false, error: string, balance: number }
 */
export async function chargeAiFeature(
  userId: string,
  featureKey: AiFeatureKey,
  metadata?: Record<string, unknown>
): Promise<{ ok: true; coinsCharged: number } | { ok: false; error: string; balance: number; required: number }> {
  const cost = await getFeatureCost(featureKey)
  if (cost === 0) return { ok: true, coinsCharged: 0 }

  // Atomic: check balance and deduct in a single transaction
  const charged = await directDeduction(userId, cost, {
    type: "ai_feature",
    featureKey,
    ...metadata,
  })

  if (!charged) {
    // Read balance for error reporting
    const { getAvailableBalance } = await import("@/lib/tokens")
    const available = await getAvailableBalance(userId)
    return { ok: false, error: "insufficient_balance", balance: available, required: cost }
  }

  return { ok: true, coinsCharged: cost }
}

/**
 * Silently charge for an AI feature — deduct if user has balance, skip otherwise.
 * Does NOT block the request on insufficient balance (fire-and-forget billing).
 */
export async function chargeAiFeatureSilent(
  userId: string,
  featureKey: AiFeatureKey,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await chargeAiFeature(userId, featureKey, metadata)
  } catch {
    // Billing should never block the feature
  }
}

/**
 * Ensure all default prices exist in DB (run at startup or on demand).
 */
export async function seedDefaultPrices() {
  const entries = Object.entries(DEFAULT_AI_PRICES) as [AiFeatureKey, { label: string; costCoins: number; description: string }][]
  for (const [featureKey, def] of entries) {
    await prisma.aiFeaturePrice.upsert({
      where: { featureKey },
      update: { label: def.label, description: def.description }, // don't overwrite admin-set prices
      create: {
        featureKey,
        label: def.label,
        costCoins: def.costCoins,
        description: def.description,
        enabled: true,
      },
    }).catch(() => {})
  }
}
