export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * Publish a script — creates PublishedScript + Series + Episodes
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const script = await prisma.script.findFirst({
      where: { id, userId: session.user.id },
      include: {
        scenes: { orderBy: { sortOrder: "asc" } },
        roles: true,
        published: true,
      },
    })

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    // Allow publishing from completed, ready, or producing status
    if (!["completed", "ready", "producing"].includes(script.status)) {
      return NextResponse.json(
        { error: "Script must be completed or ready before publishing" },
        { status: 400 }
      )
    }

    // Prevent duplicate publish
    if (script.published) {
      return NextResponse.json(
        { error: "Script is already published", publishedId: script.published.id },
        { status: 409 }
      )
    }

    const body = await req.json()
    const { tags } = body

    // Group scenes by episode
    const episodeMap = new Map<number, typeof script.scenes>()
    for (const scene of script.scenes) {
      const ep = scene.episodeNum
      if (!episodeMap.has(ep)) episodeMap.set(ep, [])
      episodeMap.get(ep)!.push(scene)
    }

    // Create Series
    const series = await prisma.series.create({
      data: {
        title: script.title,
        description: script.logline || script.synopsis || "",
        coverUrl: script.coverWide || script.coverTall || script.coverImage || null,
        genre: script.genre,
        tags: tags ? JSON.stringify(tags) : JSON.stringify([script.genre]),
        status: "active",
      },
    })

    // Create Episodes
    const episodes = []
    for (const [episodeNum, scenes] of episodeMap) {
      const totalDuration = scenes.reduce((acc, s) => acc + (s.duration || 60), 0)
      const firstScene = scenes[0]

      const episode = await prisma.episode.create({
        data: {
          seriesId: series.id,
          episodeNum,
          title: firstScene?.heading || `Episode ${episodeNum}`,
          description: scenes.map((s) => s.action).filter(Boolean).join("\n"),
          duration: totalDuration,
          unlockCost: episodeNum <= 5 ? 0 : 10, // First 5 episodes free
          status: "active",
        },
      })
      episodes.push(episode)
    }

    // Create PublishedScript record
    const published = await prisma.publishedScript.create({
      data: {
        scriptId: id,
        userId: session.user.id,
        status: "published",
        tags: tags || [script.genre],
      },
    })

    // Update script status
    await prisma.script.update({
      where: { id },
      data: {
        status: "published",
        metadata: JSON.stringify({
          ...(script.metadata ? JSON.parse(script.metadata) : {}),
          publishedSeriesId: series.id,
          publishedScriptId: published.id,
          publishedAt: new Date().toISOString(),
        }),
      },
    })

    // Create achievement card
    const userCardCount = await prisma.achievementCard.count({
      where: { userId: session.user.id },
    })
    const episodeCount = episodeMap.size
    const subtitle = userCardCount === 0
      ? "First Creation"
      : episodeCount >= 10
        ? "10-Episode Epic"
        : episodeCount >= 5
          ? "5-Episode Series"
          : null

    const card = await prisma.achievementCard.create({
      data: {
        userId: session.user.id,
        publishedScriptId: published.id,
        cardImage: script.coverTall || script.coverWide || script.coverImage || "",
        rarity: "common", // starts as common, upgrades via cron
        title: script.title,
        subtitle,
      },
    })

    return NextResponse.json({
      publishedId: published.id,
      seriesId: series.id,
      episodesCreated: episodes.length,
      newCard: {
        id: card.id,
        cardImage: card.cardImage,
        title: card.title,
        rarity: card.rarity,
      },
    })
  } catch (error) {
    console.error("Publish script error:", error)
    return NextResponse.json(
      { error: "Failed to publish script" },
      { status: 500 }
    )
  }
}
