"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Plus, Trash2 } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

interface CharacterInput {
  name: string
  personality: string
}

export default function CreateTheaterPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [genre, setGenre] = useState("drama")
  const [scenario, setScenario] = useState("")
  const [characters, setCharacters] = useState<CharacterInput[]>([
    { name: "", personality: "" },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)

  function addCharacter() {
    setCharacters([...characters, { name: "", personality: "" }])
  }

  function removeCharacter(index: number) {
    setCharacters(characters.filter((_, i) => i !== index))
  }

  function updateCharacter(index: number, field: keyof CharacterInput, value: string) {
    const updated = [...characters]
    updated[index][field] = value
    setCharacters(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !scenario.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/theaters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          genre,
          scenario: scenario.trim(),
          characters: characters.filter((c) => c.name.trim()),
        }),
      })

      if (!res.ok) throw new Error("Failed")

      const data = await res.json()
      router.push(`/theater/${data.theater.id}`)
    } catch {
      alert(t("common.processing"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/theater">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">{t("theater.createTheater")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("theater.theaterTitle")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("theater.theaterDesc")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-4 py-2.5 rounded-lg bg-muted border-0 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("theater.scenario")}</label>
          <textarea
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            placeholder={t("theater.scenarioPlaceholder")}
            rows={4}
            required
            className="w-full px-4 py-2.5 rounded-lg bg-muted border-0 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* AI 角色 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">{t("theater.characters")}</label>
            <Button type="button" variant="ghost" size="sm" onClick={addCharacter}>
              <Plus className="w-4 h-4 mr-1" />
              {t("theater.addCharacter")}
            </Button>
          </div>
          <div className="space-y-3">
            {characters.map((char, i) => (
              <Card key={i}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={char.name}
                      onChange={(e) => updateCharacter(i, "name", e.target.value)}
                      placeholder={t("theater.characterName")}
                      className="flex-1 px-3 py-2 rounded-lg bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    {characters.length > 1 && (
                      <button type="button" onClick={() => removeCharacter(i)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={char.personality}
                    onChange={(e) => updateCharacter(i, "personality", e.target.value)}
                    placeholder={t("theater.characterPersonality")}
                    className="w-full px-3 py-2 rounded-lg bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Button
          type="submit"
          disabled={!title.trim() || !scenario.trim() || isSubmitting}
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          {isSubmitting ? t("common.processing") : t("theater.startTheater")}
        </Button>
      </form>
    </div>
  )
}
