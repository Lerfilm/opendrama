import { createT, getLocaleAsync } from "@/lib/i18n"

export default async function PrivacyPage() {
  const t = createT(await getLocaleAsync())

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.privacyPolicy")}</h1>
      <div className="prose dark:prose-invert text-sm space-y-4">
        <p>OpenDrama is committed to protecting your privacy. This policy describes how we collect, use, and protect your information.</p>

        <h2 className="text-lg font-semibold mt-6">1. Information We Collect</h2>
        <p>We collect information you provide directly (name, email via Google OAuth) and usage data (watch history, interactions). We do not collect sensitive personal information beyond what is needed for authentication.</p>

        <h2 className="text-lg font-semibold">2. How We Use Information</h2>
        <p>Your information is used to provide and improve the service, personalize content recommendations, process transactions, and communicate with you about your account.</p>

        <h2 className="text-lg font-semibold">3. Data Storage</h2>
        <p>Your data is stored securely using industry-standard practices. Video content is delivered via Mux, and media assets are stored on Cloudflare R2.</p>

        <h2 className="text-lg font-semibold">4. Third-Party Services</h2>
        <p>We use the following third-party services: Google (authentication), Stripe (payments), Mux (video delivery), and AI providers for content generation. Each has their own privacy policies.</p>

        <h2 className="text-lg font-semibold">5. Your Rights</h2>
        <p>You may request access to, correction of, or deletion of your personal data by contacting us. You can delete your account at any time through the settings page.</p>

        <h2 className="text-lg font-semibold">6. Cookies</h2>
        <p>We use essential cookies for authentication and preferences (language, dev mode). We do not use tracking cookies for advertising.</p>

        <h2 className="text-lg font-semibold">7. Changes</h2>
        <p>We may update this policy from time to time. We will notify you of significant changes via the platform.</p>

        <p className="text-muted-foreground text-xs mt-8">Last updated: February 2026</p>
      </div>
    </div>
  )
}
