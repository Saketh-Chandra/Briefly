import React from 'react'

export default function TitleBar(): React.JSX.Element {
  return (
    <div
      className="h-10 w-full shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    />
  )
}
