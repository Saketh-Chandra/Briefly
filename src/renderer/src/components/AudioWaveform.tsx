import React from 'react'

interface AudioWaveformProps {
  level: number    // 0–1
  active: boolean
  barCount?: number
  className?: string
}

export default function AudioWaveform({
  level,
  active,
  barCount = 5,
  className = ''
}: AudioWaveformProps): React.JSX.Element {
  const multipliers = [0.6, 0.9, 1.0, 0.85, 0.65, 0.75, 0.95]

  return (
    <div className={`flex items-center gap-[3px] ${className}`}>
      {Array.from({ length: barCount }, (_, i) => {
        const mult = multipliers[i % multipliers.length] ?? 1
        const h = active ? Math.max(0.15, level * mult) : 0.15
        return (
          <div
            key={i}
            className="w-[3px] rounded-full transition-all duration-75"
            style={{
              height: `${Math.round(h * 20)}px`,
              minHeight: '3px',
              backgroundColor: 'var(--briefly-record)',
            }}
          />
        )
      })}
    </div>
  )
}
