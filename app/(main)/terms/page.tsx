import { createT, getLocaleAsync } from "@/lib/i18n"

export default async function TermsPage() {
  const t = createT(await getLocaleAsync())

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.termsOfService")}</h1>
      <div className="prose dark:prose-invert text-sm space-y-4">
        <p>{t("terms.intro")}</p>

        <h2 className="text-lg font-semibold mt-6">{t("terms.section1Title")}</h2>
        <p>{t("terms.section1")}</p>

        <h2 className="text-lg font-semibold">{t("terms.section2Title")}</h2>
        <p>{t("terms.section2")}</p>

        <h2 className="text-lg font-semibold">{t("terms.section3Title")}</h2>
        <p>{t("terms.section3")}</p>

        <h2 className="text-lg font-semibold">{t("terms.section4Title")}</h2>
        <p>{t("terms.section4")}</p>

        <h2 className="text-lg font-semibold">{t("terms.section5Title")}</h2>
        <p>{t("terms.section5")}</p>

        <h2 className="text-lg font-semibold">{t("terms.section6Title")}</h2>
        <p>{t("terms.section6")}</p>

        <p className="text-muted-foreground text-xs mt-8">{t("settings.lastUpdated")}</p>
      </div>
    </div>
  )
}
