"use client"

import { useEffect, useState } from "react"

interface Particle {
  left: string
  top: string
  duration: string
  delay: string
  size: string
}

export function StarParticles({ count = 30 }: { count?: number }) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    setParticles(
      Array.from({ length: count }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        duration: `${2 + Math.random() * 4}s`,
        delay: `${Math.random() * 3}s`,
        size: `${1 + Math.random() * 2}px`,
      }))
    )
  }, [count])

  if (particles.length === 0) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <div
          key={i}
          className="star-dot"
          style={{
            left: p.left,
            top: p.top,
            ["--duration" as string]: p.duration,
            ["--delay" as string]: p.delay,
            width: p.size,
            height: p.size,
          }}
        />
      ))}
    </div>
  )
}
