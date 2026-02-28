"use client"

import { useRef } from "react"
import { t } from "@/lib/i18n"

interface AudioMixerProps {
  videoVolume: number
  setVideoVolume: (v: number) => void
  audio: {
    audioUrl: string | null
    audioName: string
    audioVolume: number
    setAudioVolume: (v: number) => void
    isLoading: boolean
    uploadAudio: (file: File) => void
    removeAudio: () => void
  }
}

export function AudioMixer({ videoVolume, setVideoVolume, audio }: AudioMixerProps) {
  const audioFileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="px-3 py-1.5 flex items-center gap-3 flex-shrink-0" style={{ background: "#1E1E2E", borderBottom: "1px solid #333" }}>
      {/* VOX volume */}
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] font-semibold uppercase tracking-wider w-8" style={{ color: "#888" }}>
          VOX
        </span>
        <input
          type="range" min="0" max="1" step="0.05"
          value={videoVolume}
          onChange={e => setVideoVolume(Number(e.target.value))}
          className="w-14 h-1 accent-emerald-500"
          title={`${t("dev.editing.videoTrack")}: ${Math.round(videoVolume * 100)}%`}
        />
        <span className="text-[8px] font-mono w-6" style={{ color: "#666" }}>
          {Math.round(videoVolume * 100)}%
        </span>
      </div>

      <div className="w-px h-4" style={{ background: "#333" }} />

      {/* BGM track */}
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] font-semibold uppercase tracking-wider w-8" style={{ color: "#888" }}>
          BGM
        </span>
        {audio.audioUrl ? (
          <>
            <span className="text-[9px] truncate max-w-[80px]" style={{ color: "#A5B4FC" }} title={audio.audioName}>
              {audio.audioName}
            </span>
            <input
              type="range" min="0" max="1" step="0.05"
              value={audio.audioVolume}
              onChange={e => audio.setAudioVolume(Number(e.target.value))}
              className="w-14 h-1 accent-indigo-500"
              title={`BGM: ${Math.round(audio.audioVolume * 100)}%`}
            />
            <span className="text-[8px] font-mono w-6" style={{ color: "#666" }}>
              {Math.round(audio.audioVolume * 100)}%
            </span>
            <button
              onClick={audio.removeAudio}
              className="text-[9px] px-1 py-0.5 rounded hover:opacity-80"
              style={{ background: "#3A2020", color: "#F87171" }}
              title="Remove BGM"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <input
              ref={audioFileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) audio.uploadAudio(file)
                e.target.value = ""
              }}
            />
            <button
              onClick={() => audioFileRef.current?.click()}
              disabled={audio.isLoading}
              className="text-[9px] px-2 py-0.5 rounded transition-colors disabled:opacity-50"
              style={{ background: "#2D2D4E", color: "#A5B4FC" }}
            >
              {audio.isLoading ? "..." : "+ BGM"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
