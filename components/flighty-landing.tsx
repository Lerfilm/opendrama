"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { Play, Sparkles, Coins, PenTool, Compass, ChevronRight } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { t } from "@/lib/i18n"

// ── Types ──
type FeaturedSeries = {
  id: string
  title: string
  coverWide: string | null
  coverUrl: string | null
  coverTall?: string | null
  genre: string | null
  episodeCount: number
}

type Props = {
  items: FeaturedSeries[]
  userName?: string | null
  availableCoins?: number
  isLoggedIn?: boolean
  hotPicks?: FeaturedSeries[]
}

// ── Phone Frame Component ──
function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Phone bezel */}
      <div className="relative mx-auto w-[260px] sm:w-[280px]">
        {/* Outer frame */}
        <div className="relative rounded-[36px] border-[6px] border-gray-900 bg-gray-900 shadow-2xl shadow-black/50 overflow-hidden">
          {/* Notch / Dynamic Island */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-[90px] h-[26px] bg-gray-900 rounded-b-2xl" />
          {/* Screen */}
          <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[30px] bg-black">
            {children}
          </div>
          {/* Home indicator */}
          <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-[100px] h-[4px] bg-white/30 rounded-full" />
        </div>
      </div>
    </div>
  )
}

// ── Animated Section (fade in on scroll) ──
function AnimatedSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay)
          observer.unobserve(el)
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  )
}

// ── Main Component ──
export default function FlightyLanding({ items, userName, availableCoins = 0, isLoggedIn, hotPicks = [] }: Props) {
  const [bgProgress, setBgProgress] = useState(0)
  const heroRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [phoneScreen, setPhoneScreen] = useState(0)
  const [autoPaused, setAutoPaused] = useState(false)

  // Track scroll progress for bg transition
  useEffect(() => {
    const handleScroll = () => {
      if (!heroRef.current) return
      const rect = heroRef.current.getBoundingClientRect()
      const heroBottom = rect.bottom
      const windowH = window.innerHeight
      // Transition starts when hero is halfway scrolled, completes when hero exits
      const progress = Math.min(1, Math.max(0, 1 - heroBottom / (windowH * 1.2)))
      setBgProgress(progress)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Auto-rotate phone screens (pause when user clicks a tab)
  useEffect(() => {
    if (autoPaused) return
    const timer = setInterval(() => {
      setPhoneScreen((prev) => (prev + 1) % 3)
    }, 3500)
    return () => clearInterval(timer)
  }, [autoPaused])

  // Resume auto-rotation after 10s of inactivity
  useEffect(() => {
    if (!autoPaused) return
    const resume = setTimeout(() => setAutoPaused(false), 10000)
    return () => clearTimeout(resume)
  }, [autoPaused])

  const tabs = [
    { label: t("home.discoverTitle"), icon: "🎬" },
    { label: t("home.watchNow") || "Watch", icon: "▶" },
    { label: t("home.aiStudioTitle"), icon: "✨" },
  ]

  // Interpolate background color
  const bgColor = `rgb(${Math.round(255 - 255 * bgProgress)}, ${Math.round(255 - 255 * bgProgress)}, ${Math.round(255 - 255 * bgProgress)})`
  const textColor = bgProgress > 0.5 ? "text-white" : "text-black"
  const mutedColor = bgProgress > 0.5 ? "text-white/50" : "text-gray-500"

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor, transition: "background-color 0.1s linear" }}>

      {/* ══════════════════════════════════════════ */}
      {/* HERO SECTION - White, big typography       */}
      {/* ══════════════════════════════════════════ */}
      <div ref={heroRef} className="relative pt-14 pb-4">

        {/* ── Sticky navbar ── */}
        <div className="sticky top-0 z-50 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bgProgress > 0.5 ? "bg-white" : "bg-gray-900"}`}>
              <span className={`text-sm font-black ${bgProgress > 0.5 ? "text-black" : "text-white"}`}>O</span>
            </div>
            <span className={`font-bold text-sm tracking-wide ${textColor} transition-colors duration-300`}>OpenDrama</span>
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Link href="/recharge">
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${
                  bgProgress > 0.5
                    ? "bg-white/10 backdrop-blur border border-white/20 text-white"
                    : "bg-gray-900 text-white"
                }`}>
                  <Coins className="w-3.5 h-3.5 text-yellow-400" />
                  {availableCoins}
                </div>
              </Link>
            ) : (
              <Link href="/auth/signin">
                <Button size="sm" className={`rounded-full text-xs h-8 px-4 font-semibold transition-all duration-300 ${
                  bgProgress > 0.5
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                }`}>
                  {t("common.login")}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* ── Hero Text ── */}
        <div className="px-6 pt-8 pb-6">
          <h1 className={`text-[42px] sm:text-[52px] font-black leading-[0.95] tracking-tight ${textColor} transition-colors duration-300`}>
            {t("home.slogan")}
          </h1>
          <p className={`mt-4 text-base leading-relaxed max-w-sm ${mutedColor} transition-colors duration-300`}>
            {t("home.sloganSub")}
          </p>

          {/* Award badges */}
          <div className="flex items-center gap-4 mt-5">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className={`text-[11px] font-bold leading-tight ${textColor} transition-colors duration-300`}>AI-Powered</p>
                <p className={`text-[10px] ${mutedColor} transition-colors duration-300`}>✦ Creation 2026 ✦</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center shadow-lg">
                <Play className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className={`text-[11px] font-bold leading-tight ${textColor} transition-colors duration-300`}>Open Source</p>
                <p className={`text-[10px] ${mutedColor} transition-colors duration-300`}>✦ Filmmaking ✦</p>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════ */}
        {/* PHONE MOCKUP - Sticky while scrolling      */}
        {/* ══════════════════════════════════════════ */}
        <div className="relative" style={{ height: "900px" }}>

          {/* Sticky phone container */}
          <div className="sticky" style={{ top: "15vh" }}>
            <PhoneFrame className="mx-auto">
              {/* Phone screen content */}
              <div className="relative w-full h-full">
                {/* Screen 0: Discover / Home */}
                <div className={`absolute inset-0 transition-opacity duration-500 ${phoneScreen === 0 ? "opacity-100" : "opacity-0"}`}>
                  <div className="absolute inset-0 bg-gradient-to-b from-purple-900 via-purple-950 to-black" />
                  <div className="relative h-full flex flex-col p-3 pt-[34px]">
                    {/* Mini search bar */}
                    <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1 mb-2.5">
                      <Compass className="w-2.5 h-2.5 text-white/40" />
                      <span className="text-white/30 text-[6px]">Search dramas...</span>
                    </div>
                    <p className="text-white text-[8px] font-bold mb-1.5">🔥 Hot Picks</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(items.length > 0 ? items.slice(0, 6) : Array(6).fill(null)).map((item, i) => (
                        <div key={i} className="aspect-[2/3] rounded-md overflow-hidden bg-gray-800">
                          {item?.coverWide || item?.coverUrl ? (
                            <Image
                              src={(item.coverWide || item.coverUrl)!}
                              alt={item?.title || ""}
                              width={80}
                              height={120}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-purple-800 to-indigo-900 flex items-center justify-center">
                              <Play className="w-3 h-3 text-white/30" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Genre tags */}
                    <div className="flex gap-1 mt-2.5 flex-wrap">
                      {["Romance", "Thriller", "Fantasy", "Drama"].map((g) => (
                        <span key={g} className="text-[5px] text-white/50 bg-white/8 rounded-full px-2 py-0.5">{g}</span>
                      ))}
                    </div>
                    {/* New arrivals teaser */}
                    <p className="text-white text-[7px] font-bold mt-2.5 mb-1">✨ New Arrivals</p>
                    <div className="flex gap-1.5 flex-1 min-h-0">
                      {(items.length > 2 ? items.slice(2, 5) : Array(3).fill(null)).map((item, i) => (
                        <div key={i} className="flex-1 rounded-md overflow-hidden bg-gray-800">
                          {item?.coverWide || item?.coverUrl ? (
                            <Image
                              src={(item.coverWide || item.coverUrl)!}
                              alt={item?.title || ""}
                              width={60}
                              height={80}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-indigo-800 to-purple-900" />
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Bottom nav mock */}
                    <div className="flex justify-around py-1.5 mt-auto">
                      {["Home", "Search", "Cards", "Profile"].map((n) => (
                        <span key={n} className="text-[5px] text-white/30">{n}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Screen 1: Now Playing */}
                <div className={`absolute inset-0 transition-opacity duration-500 ${phoneScreen === 1 ? "opacity-100" : "opacity-0"}`}>
                  <div className="w-full h-full bg-black relative">
                    {items[0]?.coverWide || items[0]?.coverUrl ? (
                      <Image
                        src={(items[0].coverWide || items[0].coverUrl)!}
                        alt="Playing"
                        fill
                        className="object-cover opacity-80"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-rose-900 to-purple-950" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40" />
                    {/* Play UI overlay */}
                    <div className="absolute inset-0 flex flex-col justify-between p-3">
                      <div className="flex justify-between items-start pt-8">
                        <p className="text-white/60 text-[7px]">Episode 3 / 20</p>
                      </div>
                      <div>
                        <p className="text-white font-bold text-[10px]">{items[0]?.title || "Trapped with My Ex"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-[2px] bg-white/20 rounded-full overflow-hidden">
                            <div className="w-[35%] h-full bg-purple-500 rounded-full" />
                          </div>
                          <p className="text-white/50 text-[6px]">1:24</p>
                        </div>
                        {/* Right side icons */}
                        <div className="absolute right-3 bottom-16 flex flex-col items-center gap-3">
                          <div className="text-center">
                            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                              <span className="text-[8px]">♥</span>
                            </div>
                            <p className="text-white/50 text-[5px] mt-0.5">2.4k</p>
                          </div>
                          <div className="text-center">
                            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                              <span className="text-[8px]">💬</span>
                            </div>
                            <p className="text-white/50 text-[5px] mt-0.5">128</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Screen 2: Creator Studio */}
                <div className={`absolute inset-0 transition-opacity duration-500 ${phoneScreen === 2 ? "opacity-100" : "opacity-0"}`}>
                  <div className="absolute inset-0 bg-gradient-to-b from-indigo-900 via-indigo-950 to-black" />
                  <div className="relative h-full flex flex-col p-3 pt-[34px]">
                    <p className="text-white text-[8px] font-bold mb-0.5">✨ AI Studio</p>
                    <p className="text-white/40 text-[6px] mb-2">Script → Video in minutes</p>
                    {/* Fake script editor */}
                    <div className="rounded-lg bg-black/40 p-2 mb-2 border border-white/5">
                      <p className="text-indigo-400 text-[6px] font-mono">SCENE 1 - INT. OFFICE</p>
                      <p className="text-white/50 text-[6px] font-mono mt-0.5">ARIA walks in nervously...</p>
                      <p className="text-white/50 text-[6px] font-mono mt-0.5">She looks at the documents...</p>
                      <p className="text-green-400/80 text-[6px] font-mono mt-1">✓ AI generating video...</p>
                    </div>
                    {/* Pipeline steps */}
                    <div className="flex items-center gap-1 mb-2">
                      {["📝", "🎭", "🎬", "✅"].map((icon, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[8px] ${i < 3 ? "bg-green-500/20" : "bg-white/5"}`}>
                            {icon}
                          </div>
                          {i < 3 && <div className="w-2 h-px bg-white/20" />}
                        </div>
                      ))}
                    </div>
                    {/* Video segments */}
                    <p className="text-white/50 text-[6px] font-bold mb-1">Generated Segments</p>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      <div className="aspect-video rounded bg-purple-900/40 flex items-center justify-center border border-green-500/20">
                        <span className="text-[5px] text-green-400/70">✓ Seg 1</span>
                      </div>
                      <div className="aspect-video rounded bg-indigo-900/40 flex items-center justify-center border border-green-500/20">
                        <span className="text-[5px] text-green-400/70">✓ Seg 2</span>
                      </div>
                      <div className="aspect-video rounded bg-gray-800/60 flex items-center justify-center animate-pulse border border-purple-500/20">
                        <span className="text-[5px] text-purple-400/60">Seg 3...</span>
                      </div>
                    </div>
                    {/* Timeline mock */}
                    <div className="rounded-lg bg-black/30 p-2 border border-white/5 flex-1 min-h-0">
                      <p className="text-white/30 text-[5px] font-bold mb-1">Timeline</p>
                      <div className="flex gap-0.5 mb-1">
                        <div className="h-3 flex-[3] rounded-sm bg-purple-800/50" />
                        <div className="h-3 flex-[4] rounded-sm bg-indigo-800/50" />
                        <div className="h-3 flex-[2] rounded-sm bg-gray-700/40 animate-pulse" />
                      </div>
                      <div className="flex gap-0.5">
                        <div className="h-2 flex-1 rounded-sm bg-emerald-900/30" />
                      </div>
                      <p className="text-white/20 text-[4px] mt-1">00:00 ─────────────── 00:18</p>
                    </div>
                    {/* Bottom bar */}
                    <div className="flex justify-between items-center mt-auto pt-1.5">
                      <span className="text-[5px] text-white/30">3 of 12 scenes</span>
                      <span className="text-[5px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full">Generating...</span>
                    </div>
                  </div>
                </div>
              </div>
            </PhoneFrame>

            {/* ── Tab Bar (below phone, sticky together) ── */}
            <div className="flex items-center justify-center gap-1 mt-4 px-6">
              {tabs.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveTab(i)
                    setPhoneScreen(i)
                    setAutoPaused(true)
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 ${
                    phoneScreen === i
                      ? bgProgress > 0.5
                        ? "bg-white text-black"
                        : "bg-gray-900 text-white"
                      : bgProgress > 0.5
                        ? "text-white/50 hover:text-white/80"
                        : "text-gray-400 hover:text-gray-700"
                  }`}
                >
                  <span className="text-xs">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Spacer for scroll distance */}
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* DARK SECTION - Features                    */}
      {/* ══════════════════════════════════════════ */}
      <div className="bg-black relative z-10">

        {/* ── Press / Social Proof ── */}
        <AnimatedSection className="py-12 px-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-w-xs mx-auto">
            {[
              { quote: "AI filmmaking revolution", source: "TechCrunch" },
              { quote: "Netflix for creators", source: "Product Hunt" },
              { quote: "Open-source masterpiece", source: "Hacker News" },
              { quote: "The future of drama", source: "AI Weekly" },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className="text-white/30 text-[9px] uppercase tracking-wider font-bold mb-0.5">
                  &ldquo;{item.quote}&rdquo;
                </p>
                <p className="text-white/60 text-[10px] font-bold tracking-wider">{item.source}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>

        {/* ── Story Text ── */}
        <AnimatedSection className="px-6 py-8">
          <p className="text-white/40 text-lg leading-relaxed">
            When you had an idea for a short drama, making it felt impossible. Expensive equipment. Large crews. Months of work. ✦
          </p>
        </AnimatedSection>
        <AnimatedSection className="px-6 pb-4" delay={100}>
          <p className="text-white/40 text-lg leading-relaxed">
            Now, it feels like <span className="text-white font-semibold">magic</span>. Upload a script. AI generates every scene. From casting to final cut — in minutes, not months.
          </p>
        </AnimatedSection>
        <AnimatedSection className="px-6 pb-8" delay={200}>
          <p className="text-white/60 text-lg leading-relaxed">
            OpenDrama is how millions of storytellers bring their dramas to life, at last.
          </p>
        </AnimatedSection>

        {/* ── Feature 1: Watch ── */}
        <AnimatedSection className="mx-4 mb-4">
          <div className="rounded-3xl bg-[#0d0d1a] p-6 overflow-hidden">
            <h3 className="text-white text-xl font-black leading-tight mb-2">
              Binge-worthy short dramas. Finally!
            </h3>
            <p className="text-white/40 text-sm leading-relaxed mb-5">
              Vertical dramas crafted for your phone. 1-2 minute episodes, swipe to advance. Get hooked in seconds.
            </p>
            {/* Feature phone mockup */}
            <div className="flex justify-center">
              <div className="w-[200px] rounded-[24px] border-[4px] border-gray-800 overflow-hidden shadow-xl shadow-purple-500/10">
                <div className="aspect-[9/16] bg-black relative overflow-hidden">
                  {items[0]?.coverWide || items[0]?.coverUrl ? (
                    <Image
                      src={(items[0].coverWide || items[0].coverUrl)!}
                      alt="Drama"
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-rose-900 to-purple-950" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-white font-bold text-[10px]">{items[0]?.title || "Short Drama"}</p>
                    <p className="text-white/50 text-[8px]">Episode 1 · Swipe ↑ for next</p>
                  </div>
                  {/* Right side TikTok-style icons */}
                  <div className="absolute right-2 bottom-10 flex flex-col gap-2">
                    <div className="w-6 h-6 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                      <span className="text-[10px]">♥</span>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                      <span className="text-[10px]">💬</span>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                      <span className="text-[10px]">↗</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* ── Feature 2: AI Creation ── */}
        <AnimatedSection className="mx-4 mb-4">
          <div className="rounded-3xl bg-gradient-to-br from-violet-950/80 to-indigo-950/80 p-6 overflow-hidden border border-violet-800/20">
            <h3 className="text-violet-300 text-xl font-black leading-tight mb-2">
              Script to screen. AI does the rest.
            </h3>
            <p className="text-white/40 text-sm leading-relaxed mb-5">
              Upload a PDF script. AI casts characters, scouts locations, generates video segments — all automatically. You direct, AI creates.
            </p>
            {/* Pipeline visualization */}
            <div className="flex items-center justify-between gap-2">
              {["📝 Script", "🎭 Cast", "🎬 Video", "🎞️ Publish"].map((step, i) => (
                <div key={i} className="flex-1 text-center">
                  <div className="w-10 h-10 mx-auto rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-sm mb-1">
                    {step.split(" ")[0]}
                  </div>
                  <p className="text-white/40 text-[8px]">{step.split(" ")[1]}</p>
                  {i < 3 && (
                    <div className="absolute" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* ── Feature 3: Collectible Cards ── */}
        <AnimatedSection className="mx-4 mb-4">
          <div className="rounded-3xl bg-gradient-to-br from-amber-950/60 to-orange-950/60 p-6 overflow-hidden border border-amber-800/20">
            <h3 className="text-amber-300 text-xl font-black leading-tight mb-2">
              Collect character cards. Show them off.
            </h3>
            <p className="text-white/40 text-sm leading-relaxed">
              Every drama has collectible character cards. Common, Rare, Epic, Legendary — unlock them by watching. Trade and flex your collection.
            </p>
            {/* Card rarity badges */}
            <div className="flex gap-2 mt-4">
              {[
                { rarity: "Common", color: "from-gray-400 to-gray-500" },
                { rarity: "Rare", color: "from-blue-400 to-blue-600" },
                { rarity: "Epic", color: "from-purple-400 to-purple-600" },
                { rarity: "Legend", color: "from-amber-400 to-orange-500" },
              ].map((card, i) => (
                <div key={i} className="flex-1">
                  <div className={`aspect-[3/4] rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg`}>
                    <span className="text-white text-lg">🃏</span>
                  </div>
                  <p className="text-white/30 text-[8px] text-center mt-1">{card.rarity}</p>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* ── Feature 4: Open Source ── */}
        <AnimatedSection className="mx-4 mb-4">
          <div className="rounded-3xl bg-[#0a1a0a] p-6 overflow-hidden border border-green-900/30">
            <h3 className="text-green-400 text-xl font-black leading-tight mb-2">
              100% Open Source. Own your stories.
            </h3>
            <p className="text-white/40 text-sm leading-relaxed">
              Built by filmmakers, for filmmakers. Self-host it. Modify it. No lock-in. Your dramas, your data, your platform.
            </p>
          </div>
        </AnimatedSection>

        {/* ── CTA Section ── */}
        <AnimatedSection className="py-12 px-6 text-center">
          <h2 className="text-white text-2xl font-black mb-3">Start your drama journey</h2>
          <p className="text-white/40 text-sm mb-6">Free to watch. Free to create. Forever.</p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/discover">
              <Button className="rounded-full bg-white text-black hover:bg-white/90 font-bold px-6 h-11 text-sm shadow-lg shadow-white/10">
                <Play className="w-4 h-4 mr-2" />
                {t("home.exploreNow")}
              </Button>
            </Link>
            <Link href="/studio">
              <Button variant="outline" className="rounded-full border-white/20 text-white bg-white/5 hover:bg-white/10 font-semibold px-6 h-11 text-sm">
                <PenTool className="w-4 h-4 mr-2" />
                {t("home.startCreate")}
              </Button>
            </Link>
          </div>
        </AnimatedSection>

        {/* ── Footer ── */}
        <div className="px-6 pb-24 pt-6 border-t border-white/5">
          <div className="text-center space-y-2">
            <p className="text-white/20 text-[11px] tracking-wider uppercase">
              A LerFilm Production
            </p>
            <p className="text-white/10 text-[10px]">
              &copy; 2026 OpenDrama. Open source filmmaking for everyone.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
