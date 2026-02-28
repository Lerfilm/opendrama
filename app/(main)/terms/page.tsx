import { createT, getLocaleAsync } from "@/lib/i18n"

export default async function TermsPage() {
  const t = createT(await getLocaleAsync())

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.termsOfService")}</h1>
      <div className="prose dark:prose-invert text-sm space-y-4">
        <p>Welcome to OpenDrama. By using our platform, you agree to these terms.</p>

        <h2 className="text-lg font-semibold mt-6">1. Use of Service</h2>
        <p>OpenDrama provides AI-powered video streaming and creation tools. You must be at least 13 years old to use the service. You are responsible for maintaining the security of your account.</p>

        <h2 className="text-lg font-semibold">2. Content</h2>
        <p>Users may create, upload, and publish content through our platform. You retain ownership of your original content. By publishing, you grant OpenDrama a non-exclusive license to display and distribute your content on the platform.</p>

        <h2 className="text-lg font-semibold">3. Virtual Currency</h2>
        <p>Coins purchased on OpenDrama are virtual currency used to unlock episodes and AI features. Coins are non-refundable and have no cash value outside the platform.</p>

        <h2 className="text-lg font-semibold">4. Prohibited Conduct</h2>
        <p>You agree not to misuse the platform, including but not limited to: uploading harmful content, attempting to exploit system vulnerabilities, or violating intellectual property rights.</p>

        <h2 className="text-lg font-semibold">5. Termination</h2>
        <p>We reserve the right to suspend or terminate accounts that violate these terms.</p>

        <h2 className="text-lg font-semibold">6. Changes</h2>
        <p>We may update these terms from time to time. Continued use of the platform constitutes acceptance of the updated terms.</p>

        <p className="text-muted-foreground text-xs mt-8">Last updated: February 2026</p>
      </div>
    </div>
  )
}
