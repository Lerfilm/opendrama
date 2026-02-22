/**
 * Model pricing table — pure constants, safe for client and server.
 * API cost per second in cents USD.
 */
export const MODEL_PRICING: Record<string, Record<string, number>> = {
  // Seedance series (Volcengine Ark API)
  seedance_2_0:          { "1080p": 80,  "720p": 40 },  // fallback to 1.5-pro; kept for legacy records
  seedance_1_5_pro:      { "1080p": 100, "720p": 50 },
  seedance_1_0_pro:      { "1080p": 80,  "720p": 40 },
  seedance_1_0_pro_fast: { "1080p": 40,  "720p": 20 },  // fast variant — lower cost
  // Jimeng series (Volcengine Visual API)
  jimeng_3_0_pro:        { "1080p": 100 },
  jimeng_3_0:            { "1080p": 63, "720p": 28 },
  jimeng_s2_pro:         { "720p": 65 },
}
