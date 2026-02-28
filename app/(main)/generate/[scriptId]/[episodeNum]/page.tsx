import { redirect } from "next/navigation"

export default async function GenerateEpisodePage({
  params,
}: {
  params: Promise<{ scriptId: string; episodeNum: string }>
}) {
  const { scriptId } = await params
  redirect(`/studio/script/${scriptId}`)
}
