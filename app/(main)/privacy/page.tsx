import { createT, getLocaleAsync } from "@/lib/i18n"

export default async function PrivacyPage() {
  const t = createT(await getLocaleAsync())

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.privacyPolicy")}</h1>
      <div className="prose dark:prose-invert text-sm space-y-4">
        <p>{t("privacy.intro")}</p>

        <h2 className="text-lg font-semibold mt-6">{t("privacy.section1Title")}</h2>
        <p>{t("privacy.section1")}</p>

        <h2 className="text-lg font-semibold">{t("privacy.section2Title")}</h2>
        <p>{t("privacy.section2")}</p>

        <h2 className="text-lg font-semibold">{t("privacy.section3Title")}</h2>
        <p>{t("privacy.section3")}</p>

        <h2 className="text-lg font-semibold">{t("privacy.section4Title")}</h2>
        <p>{t("privacy.section4")}</p>

        <h2 className="text-lg font-semibold">{t("privacy.section5Title")}</h2>
        <p>{t("privacy.section5")}</p>

        <h2 className="text-lg font-semibold">{t("privacy.section6Title")}</h2>
        <p>{t("privacy.section6")}</p>

        <h2 className="text-lg font-semibold">{t("privacy.section7Title")}</h2>
        <p>{t("privacy.section7")}</p>

        <p className="text-muted-foreground text-xs mt-8">{t("settings.lastUpdated")}</p>
      </div>
    </div>
  )
}
