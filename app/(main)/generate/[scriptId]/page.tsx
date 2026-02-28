import { redirect } from "next/navigation"

export default async function GenerateScriptPage({
  params,
}: {
  params: Promise<{ scriptId: string }>
}) {
  const { scriptId } = await params
  redirect(`/studio/script/${scriptId}`)
}
