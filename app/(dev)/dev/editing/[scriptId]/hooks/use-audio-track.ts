"use client"

import { useState, useRef, useCallback, useEffect } from "react"

export function useAudioTrack(scriptId: string, episodeNum: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioName, setAudioName] = useState<string>("")
  const [audioVolume, setAudioVolume] = useState(0.5)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch saved audio track on mount / episode change
  useEffect(() => {
    let cancelled = false
    fetch(`/api/editing/audio-track?scriptId=${scriptId}&episodeNum=${episodeNum}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.track) {
          setAudioUrl(data.track.url)
          setAudioName(data.track.name)
        } else {
          setAudioUrl(null)
          setAudioName("")
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [scriptId, episodeNum])

  // Create / update audio element
  useEffect(() => {
    if (!audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      return
    }
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.loop = true
    }
    audioRef.current.src = audioUrl
    audioRef.current.volume = audioVolume
    audioRef.current.load()
  }, [audioUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Volume sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = audioVolume
  }, [audioVolume])

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {})
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const seekTo = useCallback((sec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = sec
    }
  }, [])

  // Upload handler
  const uploadAudio = useCallback(async (file: File) => {
    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("bucket", "audio-tracks")
      const uploadRes = await fetch("/api/upload/media", { method: "POST", body: formData })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed")

      await fetch("/api/editing/audio-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId, episodeNum, audioUrl: uploadData.url, audioName: file.name }),
      })

      setAudioUrl(uploadData.url)
      setAudioName(file.name)
    } catch (err) {
      console.error("Audio upload failed:", err)
      alert("Audio upload failed")
    } finally {
      setIsLoading(false)
    }
  }, [scriptId, episodeNum])

  // Remove handler
  const removeAudio = useCallback(async () => {
    try {
      await fetch("/api/editing/audio-track", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId, episodeNum }),
      })
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setAudioUrl(null)
      setAudioName("")
    } catch (err) {
      console.error("Audio remove failed:", err)
    }
  }, [scriptId, episodeNum])

  return {
    audioUrl, audioName, audioVolume, setAudioVolume,
    isLoading, play, pause, seekTo, uploadAudio, removeAudio,
  }
}
