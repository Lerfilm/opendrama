import prisma from "@/lib/prisma"
import { aiComplete } from "@/lib/ai"

/**
 * Generate a cover prompt for an episode using LLM.
 */
export async function generateCoverPrompt(scriptId: string, episodeNum: number): Promise<string> {
  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    include: {
      scenes: { where: { episodeNum }, orderBy: { sceneNum: "asc" } },
      roles: true,
    },
  })
  if (!script) throw new Error("Script not found")

  const sceneSummary = script.scenes
    .map((s) => `Scene ${s.sceneNum}: ${s.location || ""} - ${(s.action || "").slice(0, 100)}`)
    .join("\n")
  const characterNames = script.roles.map((r) => r.name).join(", ")

  const result = await aiComplete({
    messages: [
      {
        role: "system",
        content: `You are a professional movie poster designer. Generate an AI image generation prompt based on the following episode information.
Requirements:
- Movie poster style, visually striking
- Describe composition, character poses, scene atmosphere, lighting and color
- Do NOT include any text in the image
- English description, under 800 characters
- Suitable for cinematic poster style`,
      },
      {
        role: "user",
        content: `Title: ${script.title}
Episode ${episodeNum}
Characters: ${characterNames}
Scenes:
${sceneSummary}`,
      },
    ],
    temperature: 0.9,
    maxTokens: 1024,
  })

  return result.content
}

/**
 * Submit cover generation tasks (wide + tall) to Jimeng 4.0.
 */
export async function submitCoverGeneration(
  scriptId: string,
  episodeNum: number,
  prompt: string
): Promise<{ wideTaskId: string; tallTaskId: string }> {
  // TODO: Implement Volcengine API calls
  // Wide 16:9: { req_key: "jimeng_t2i_v40", prompt, width: 2560, height: 1440, force_single: true }
  // Tall 3:4:  { req_key: "jimeng_t2i_v40", prompt, width: 2496, height: 3328, force_single: true }
  // Both requests in parallel
  return { wideTaskId: "mock_wide_task", tallTaskId: "mock_tall_task" }
}

/**
 * Query cover generation result.
 */
export async function queryCoverResult(taskId: string): Promise<{ imageUrl?: string; status: string }> {
  // TODO: Implement Volcengine API query
  // Returns image_urls array (valid for 24h, need to download and save to permanent storage)
  return { status: "pending" }
}
