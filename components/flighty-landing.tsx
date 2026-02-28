"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { Play, Sparkles, Coins, PenTool, Compass, Users, Video, Send, Film, Star, Crown, Code, Heart } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { t, getLocale, setLocale, type Locale } from "@/lib/i18n"

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

// ── Language Toggle ──
function LanguageToggle({ isDark }: { isDark: boolean }) {
  const [locale, setCurrentLocale] = useState<Locale>("en")

  useEffect(() => {
    setCurrentLocale(getLocale())
  }, [])

  const toggle = () => {
    const next: Locale = locale === "zh" ? "en" : "zh"
    setLocale(next)
    setCurrentLocale(next)
    setTimeout(() => window.location.reload(), 200)
  }

  return (
    <button
      onClick={toggle}
      className={`relative w-[52px] h-[26px] rounded-full transition-all duration-300 flex items-center px-0.5 ${
        isDark
          ? "bg-white/10 border border-white/20"
          : "bg-gray-100 border border-gray-200"
      }`}
    >
      {/* Sliding indicator */}
      <div
        className={`absolute w-[22px] h-[22px] rounded-full transition-all duration-300 shadow-sm ${
          locale === "zh" ? "left-[27px]" : "left-[1px]"
        } ${isDark ? "bg-white" : "bg-gray-900"}`}
      />
      {/* Labels */}
      <span className={`relative z-10 w-1/2 text-center text-[9px] font-bold transition-colors duration-300 ${
        locale === "en"
          ? isDark ? "text-gray-900" : "text-white"
          : isDark ? "text-white/50" : "text-gray-400"
      }`}>En</span>
      <span className={`relative z-10 w-1/2 text-center text-[9px] font-bold transition-colors duration-300 ${
        locale === "zh"
          ? isDark ? "text-gray-900" : "text-white"
          : isDark ? "text-white/50" : "text-gray-400"
      }`}>中</span>
    </button>
  )
}

// ── Phone Frame Component ──
function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative mx-auto w-[260px] sm:w-[280px]">
        {/* Glow effect behind phone */}
        <div className="absolute inset-0 -m-4 bg-gradient-to-b from-purple-500/20 via-indigo-500/10 to-transparent rounded-[50px] blur-2xl" />
        {/* Outer frame */}
        <div className="relative rounded-[36px] border-[6px] border-gray-900 bg-gray-900 shadow-2xl shadow-black/50 overflow-hidden">
          {/* Dynamic Island */}
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

// ── Pipeline Step Icon ──
function PipelineIcon({ icon: Icon, label, done, active }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  done: boolean
  active: boolean
}) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${
        done
          ? "bg-violet-500/30 border-2 border-violet-400/50 shadow-lg shadow-violet-500/20"
          : active
            ? "bg-violet-500/20 border-2 border-violet-500/30 animate-pulse"
            : "bg-white/5 border border-white/10"
      }`}>
        <Icon className={`w-5 h-5 ${done ? "text-violet-300" : active ? "text-violet-400" : "text-white/30"}`} />
      </div>
      <span className={`text-[9px] font-semibold ${done ? "text-violet-300" : "text-white/40"}`}>{label}</span>
    </div>
  )
}

// ── Pipeline Arrow ──
function PipelineArrow() {
  return (
    <div className="flex items-center -mx-1 mt-[-18px]">
      <svg width="24" height="12" viewBox="0 0 24 12" fill="none" className="text-violet-500/40">
        <path d="M0 6h20M16 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
    { label: t("home.discoverTitle"), icon: Compass },
    { label: t("home.watchNow") || "Watch", icon: Play },
    { label: t("home.aiStudioTitle"), icon: Sparkles },
  ]

  // Interpolate background
  const bgColor = `rgb(${Math.round(255 - 255 * bgProgress)}, ${Math.round(255 - 255 * bgProgress)}, ${Math.round(255 - 255 * bgProgress)})`
  const isDark = bgProgress > 0.5
  const textColor = isDark ? "text-white" : "text-black"
  const mutedColor = isDark ? "text-white/50" : "text-gray-500"

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor, transition: "background-color 0.1s linear" }}>

      {/* ══════════════════════════════════════════ */}
      {/* HERO SECTION                               */}
      {/* ══════════════════════════════════════════ */}
      <div ref={heroRef} className="relative pt-14 pb-4">

        {/* ── Sticky navbar ── */}
        <div className="sticky top-0 z-50 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${isDark ? "bg-white" : "bg-gray-900"}`}>
              <span className={`text-sm font-black ${isDark ? "text-black" : "text-white"}`}>O</span>
            </div>
            <span className={`font-bold text-sm tracking-wide ${textColor} transition-colors duration-300`}>OpenDrama</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle isDark={isDark} />
            {isLoggedIn ? (
              <Link href="/recharge">
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${
                  isDark
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
                  isDark
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
          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center gap-2.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                isDark
                  ? "bg-gradient-to-br from-violet-500 to-purple-700 shadow-violet-500/20"
                  : "bg-gradient-to-br from-violet-500 to-purple-700 shadow-violet-500/30"
              }`}>
                <Sparkles className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <p className={`text-[11px] font-bold leading-tight ${textColor} transition-colors duration-300`}>AI-Powered</p>
                <p className={`text-[10px] ${mutedColor} transition-colors duration-300`}>Creation 2026</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                isDark
                  ? "bg-gradient-to-br from-orange-400 to-red-600 shadow-orange-500/20"
                  : "bg-gradient-to-br from-orange-400 to-red-600 shadow-orange-500/30"
              }`}>
                <Code className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <p className={`text-[11px] font-bold leading-tight ${textColor} transition-colors duration-300`}>Open Source</p>
                <p className={`text-[10px] ${mutedColor} transition-colors duration-300`}>Filmmaking</p>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════ */}
        {/* PHONE MOCKUP - Sticky while scrolling      */}
        {/* ══════════════════════════════════════════ */}
        <div className="relative" style={{ height: "900px" }}>
          <div className="sticky" style={{ top: "15vh" }}>
            <PhoneFrame className="mx-auto">
              <div className="relative w-full h-full">
                {/* Screen 0: Discover */}
                <div className={`absolute inset-0 transition-opacity duration-500 ${phoneScreen === 0 ? "opacity-100" : "opacity-0"}`}>
                  <div className="absolute inset-0 bg-gradient-to-b from-purple-900 via-purple-950 to-black" />
                  <div className="relative h-full flex flex-col p-3 pt-[34px]">
                    <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1 mb-2.5">
                      <Compass className="w-2.5 h-2.5 text-white/40" />
                      <span className="text-white/30 text-[6px]">Search dramas...</span>
                    </div>
                    <p className="text-white text-[8px] font-bold mb-1.5">🔥 Hot Picks</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(items.length > 0 ? items.slice(0, 6) : Array(6).fill(null)).map((item, i) => (
                        <div key={i} className="aspect-[2/3] rounded-md overflow-hidden bg-gray-800">
                          {item?.coverWide || item?.coverUrl ? (
                            <Image src={(item.coverWide || item.coverUrl)!} alt={item?.title || ""} width={80} height={120} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-purple-800 to-indigo-900 flex items-center justify-center">
                              <Play className="w-3 h-3 text-white/30" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1 mt-2.5 flex-wrap">
                      {["Romance", "Thriller", "Fantasy", "Drama"].map((g) => (
                        <span key={g} className="text-[5px] text-white/50 bg-white/8 rounded-full px-2 py-0.5">{g}</span>
                      ))}
                    </div>
                    <p className="text-white text-[7px] font-bold mt-2.5 mb-1">✨ New Arrivals</p>
                    <div className="flex gap-1.5 flex-1 min-h-0">
                      {(items.length > 2 ? items.slice(2, 5) : Array(3).fill(null)).map((item, i) => (
                        <div key={i} className="flex-1 rounded-md overflow-hidden bg-gray-800">
                          {item?.coverWide || item?.coverUrl ? (
                            <Image src={(item.coverWide || item.coverUrl)!} alt={item?.title || ""} width={60} height={80} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-indigo-800 to-purple-900" />
                          )}
                        </div>
                      ))}
                    </div>
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
                      <Image src={(items[0].coverWide || items[0].coverUrl)!} alt="Playing" fill className="object-cover opacity-80" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-rose-900 to-purple-950" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40" />
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
                        <div className="absolute right-3 bottom-16 flex flex-col items-center gap-3">
                          <div className="text-center">
                            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                              <Heart className="w-2.5 h-2.5 text-rose-400" />
                            </div>
                            <p className="text-white/50 text-[5px] mt-0.5">2.4k</p>
                          </div>
                          <div className="text-center">
                            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                              <Send className="w-2.5 h-2.5 text-white/60" />
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
                    <div className="rounded-lg bg-black/40 p-2 mb-2 border border-white/5">
                      <p className="text-indigo-400 text-[6px] font-mono">SCENE 1 - INT. OFFICE</p>
                      <p className="text-white/50 text-[6px] font-mono mt-0.5">ARIA walks in nervously...</p>
                      <p className="text-white/50 text-[6px] font-mono mt-0.5">She looks at the documents...</p>
                      <p className="text-green-400/80 text-[6px] font-mono mt-1">✓ AI generating video...</p>
                    </div>
                    <div className="flex items-center gap-1 mb-2">
                      {[PenTool, Users, Video, Send].map((Icon, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center ${i < 3 ? "bg-green-500/20" : "bg-white/5"}`}>
                            <Icon className={`w-2.5 h-2.5 ${i < 3 ? "text-green-400/70" : "text-white/30"}`} />
                          </div>
                          {i < 3 && <div className="w-2 h-px bg-white/20" />}
                        </div>
                      ))}
                    </div>
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
                    <div className="flex justify-between items-center mt-auto pt-1.5">
                      <span className="text-[5px] text-white/30">3 of 12 scenes</span>
                      <span className="text-[5px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full">Generating...</span>
                    </div>
                  </div>
                </div>
              </div>
            </PhoneFrame>

            {/* ── Tab Bar ── */}
            <div className="flex items-center justify-center gap-1 mt-5 px-6">
              {tabs.map((tab, i) => {
                const Icon = tab.icon
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveTab(i)
                      setPhoneScreen(i)
                      setAutoPaused(true)
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold transition-all duration-300 ${
                      phoneScreen === i
                        ? isDark
                          ? "bg-white text-black shadow-lg shadow-white/10"
                          : "bg-gray-900 text-white shadow-lg shadow-black/20"
                        : isDark
                          ? "text-white/40 hover:text-white/70"
                          : "text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* DARK SECTION - Features                    */}
      {/* ══════════════════════════════════════════ */}
      <div className="bg-black relative z-10">

        {/* ── Press / Social Proof ── */}
        <AnimatedSection className="py-12 px-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-w-xs mx-auto">
            {[
              { quote: "AI filmmaking revolution", source: "TechCrunch" },
              { quote: "Netflix for creators", source: "Product Hunt" },
              { quote: "Open-source masterpiece", source: "Hacker News" },
              { quote: "The future of drama", source: "AI Weekly" },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className="text-white/25 text-[9px] uppercase tracking-wider font-bold mb-1">
                  &ldquo;{item.quote}&rdquo;
                </p>
                <p className="text-white/50 text-[10px] font-bold tracking-wider">{item.source}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>

        {/* ── Story Text ── */}
        <AnimatedSection className="px-6 py-8">
          <p className="text-white/35 text-lg leading-relaxed">
            {t("home.storyParagraph1") !== "home.storyParagraph1"
              ? t("home.storyParagraph1")
              : "When you had an idea for a short drama, making it felt impossible. Expensive equipment. Large crews. Months of work."
            }
          </p>
        </AnimatedSection>
        <AnimatedSection className="px-6 pb-4" delay={100}>
          <p className="text-white/35 text-lg leading-relaxed">
            {t("home.storyParagraph2") !== "home.storyParagraph2"
              ? t("home.storyParagraph2")
              : <>Now, it feels like <span className="text-white font-semibold">magic</span>. Upload a script. AI generates every scene. From casting to final cut — in minutes, not months.</>
            }
          </p>
        </AnimatedSection>
        <AnimatedSection className="px-6 pb-10" delay={200}>
          <p className="text-white/50 text-lg leading-relaxed font-medium">
            {t("home.storyParagraph3") !== "home.storyParagraph3"
              ? t("home.storyParagraph3")
              : "OpenDrama is how storytellers bring their dramas to life, at last."
            }
          </p>
        </AnimatedSection>

        {/* ── Feature 1: Watch ── */}
        <AnimatedSection className="mx-4 mb-4">
          <div className="rounded-3xl bg-gradient-to-b from-[#0d0d1a] to-[#0a0a15] p-6 overflow-hidden border border-white/[0.04]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center">
                <Film className="w-4 h-4 text-rose-400" />
              </div>
              <span className="text-rose-400/60 text-[10px] font-bold uppercase tracking-wider">Watch</span>
            </div>
            <h3 className="text-white text-xl font-black leading-tight mb-2">
              {t("home.featureWatchTitle") !== "home.featureWatchTitle" ? t("home.featureWatchTitle") : "Binge-worthy short dramas. Finally!"}
            </h3>
            <p className="text-white/35 text-sm leading-relaxed mb-5">
              {t("home.featureWatchDesc") !== "home.featureWatchDesc" ? t("home.featureWatchDesc") : "Vertical dramas crafted for your phone. 1-2 minute episodes, swipe to advance. Get hooked in seconds."}
            </p>
            <div className="flex justify-center">
              <div className="w-[200px] rounded-[24px] border-[4px] border-gray-800 overflow-hidden shadow-xl shadow-rose-500/5">
                <div className="aspect-[9/16] bg-black relative overflow-hidden">
                  {items[0]?.coverWide || items[0]?.coverUrl ? (
                    <Image src={(items[0].coverWide || items[0].coverUrl)!} alt="Drama" fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-rose-900 to-purple-950" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-white font-bold text-[10px]">{items[0]?.title || "Short Drama"}</p>
                    <p className="text-white/50 text-[8px]">Episode 1 · Swipe ↑ for next</p>
                  </div>
                  <div className="absolute right-2 bottom-10 flex flex-col gap-2">
                    <div className="w-6 h-6 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                      <Heart className="w-3 h-3 text-rose-400" />
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                      <Send className="w-3 h-3 text-white/60" />
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                      <Star className="w-3 h-3 text-yellow-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* ── Feature 2: AI Creation ── */}
        <AnimatedSection className="mx-4 mb-4">
          <div className="rounded-3xl bg-gradient-to-b from-violet-950/80 to-indigo-950/60 p-6 overflow-hidden border border-violet-700/15">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-violet-400" />
              </div>
              <span className="text-violet-400/60 text-[10px] font-bold uppercase tracking-wider">AI Creation</span>
            </div>
            <h3 className="text-violet-200 text-xl font-black leading-tight mb-2">
              {t("home.featureAITitle") !== "home.featureAITitle" ? t("home.featureAITitle") : "Script to screen. AI does the rest."}
            </h3>
            <p className="text-white/35 text-sm leading-relaxed mb-6">
              {t("home.featureAIDesc") !== "home.featureAIDesc" ? t("home.featureAIDesc") : "Upload a PDF script. AI casts characters, scouts locations, generates video segments — all automatically."}
            </p>
            {/* Pipeline visualization with SVG icons */}
            <div className="flex items-start justify-between">
              <PipelineIcon icon={PenTool} label="Script" done={true} active={false} />
              <PipelineArrow />
              <PipelineIcon icon={Users} label="Cast" done={true} active={false} />
              <PipelineArrow />
              <PipelineIcon icon={Video} label="Video" done={false} active={true} />
              <PipelineArrow />
              <PipelineIcon icon={Send} label="Publish" done={false} active={false} />
            </div>
          </div>
        </AnimatedSection>

        {/* ── Feature 3: Collectible Cards ── */}
        <AnimatedSection className="mx-4 mb-4">
          <div className="rounded-3xl bg-gradient-to-b from-amber-950/50 to-orange-950/40 p-6 overflow-hidden border border-amber-700/15">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-amber-400/60 text-[10px] font-bold uppercase tracking-wider">Collect</span>
            </div>
            <h3 className="text-amber-200 text-xl font-black leading-tight mb-2">
              {t("home.featureCardsTitle") !== "home.featureCardsTitle" ? t("home.featureCardsTitle") : "Collect character cards. Show them off."}
            </h3>
            <p className="text-white/35 text-sm leading-relaxed mb-5">
              {t("home.featureCardsDesc") !== "home.featureCardsDesc" ? t("home.featureCardsDesc") : "Every drama has collectible character cards. Common, Rare, Epic, Legendary — unlock them by watching."}
            </p>
            {/* Card rarity showcase */}
            <div className="flex gap-2.5">
              {[
                { rarity: "Common", from: "from-slate-400", to: "to-slate-600", border: "border-slate-400/30", shadow: "shadow-slate-400/10" },
                { rarity: "Rare", from: "from-blue-400", to: "to-blue-600", border: "border-blue-400/30", shadow: "shadow-blue-400/10" },
                { rarity: "Epic", from: "from-purple-400", to: "to-purple-600", border: "border-purple-400/30", shadow: "shadow-purple-400/10" },
                { rarity: "Legend", from: "from-amber-400", to: "to-orange-500", border: "border-amber-400/30", shadow: "shadow-amber-400/20" },
              ].map((card, i) => (
                <div key={i} className="flex-1">
                  <div className={`aspect-[3/4] rounded-xl bg-gradient-to-br ${card.from} ${card.to} border ${card.border} shadow-lg ${card.shadow} flex flex-col items-center justify-center relative overflow-hidden`}>
                    {/* Shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-50" />
                    {/* Inner content */}
                    <div className="relative z-10 flex flex-col items-center">
                      {i === 3 ? (
                        <Crown className="w-5 h-5 text-white drop-shadow-lg" />
                      ) : i === 2 ? (
                        <Sparkles className="w-5 h-5 text-white drop-shadow-lg" />
                      ) : i === 1 ? (
                        <Star className="w-5 h-5 text-white drop-shadow-lg" />
                      ) : (
                        <Heart className="w-5 h-5 text-white drop-shadow-lg" />
                      )}
                    </div>
                    {/* Bottom glow */}
                    <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />
                  </div>
                  <p className="text-white/30 text-[8px] text-center mt-1.5 font-semibold">{card.rarity}</p>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* ── Feature 4: Open Source ── */}
        <AnimatedSection className="mx-4 mb-4">
          <div className="rounded-3xl bg-gradient-to-b from-[#0a1a0a] to-[#060f06] p-6 overflow-hidden border border-green-800/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Code className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-green-400/60 text-[10px] font-bold uppercase tracking-wider">Open Source</span>
            </div>
            <h3 className="text-green-300 text-xl font-black leading-tight mb-2">
              {t("home.featureOSSTitle") !== "home.featureOSSTitle" ? t("home.featureOSSTitle") : "100% Open Source. Own your stories."}
            </h3>
            <p className="text-white/35 text-sm leading-relaxed">
              {t("home.featureOSSDesc") !== "home.featureOSSDesc" ? t("home.featureOSSDesc") : "Built by filmmakers, for filmmakers. Self-host it. Modify it. No lock-in. Your dramas, your data, your platform."}
            </p>
            {/* GitHub-style activity mock */}
            <div className="mt-4 flex gap-[3px]">
              {Array(20).fill(0).map((_, i) => (
                <div key={i} className={`w-3 h-3 rounded-sm ${
                  i % 7 === 0 ? "bg-green-400/60" :
                  i % 3 === 0 ? "bg-green-500/30" :
                  i % 2 === 0 ? "bg-green-600/15" : "bg-white/5"
                }`} />
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* ── CTA Section ── */}
        <AnimatedSection className="py-14 px-6 text-center">
          <h2 className="text-white text-2xl font-black mb-3">
            {t("home.ctaTitle") !== "home.ctaTitle" ? t("home.ctaTitle") : "Start your drama journey"}
          </h2>
          <p className="text-white/35 text-sm mb-7">
            {t("home.ctaDesc") !== "home.ctaDesc" ? t("home.ctaDesc") : "Free to watch. Free to create. Forever."}
          </p>
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

        {/* ── Developer Mode Banner ── */}
        {isLoggedIn && (
          <div className="mx-4 mb-6">
            <Link href="/developer">
              <div className="rounded-2xl bg-gradient-to-r from-slate-800/80 to-slate-700/60 p-4 overflow-hidden border border-white/5 group active:scale-[0.98] transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                      <Code className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-white/60 font-medium text-xs">{t("home.devToolsTitle")}</h3>
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300/50 font-medium uppercase tracking-wider">Desktop</span>
                      </div>
                      <p className="text-white/25 text-[10px]">{t("home.devToolsDesc")}</p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-white/15 group-hover:text-white/40 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="px-6 pb-24 pt-6 border-t border-white/5">
          <div className="text-center space-y-2">
            <p className="text-white/15 text-[11px] tracking-wider uppercase">
              A LerFilm Production
            </p>
            <p className="text-white/8 text-[10px]">
              &copy; 2026 OpenDrama. Open source filmmaking for everyone.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
