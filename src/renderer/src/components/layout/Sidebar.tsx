import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, List, BookOpen, Settings, Circle, Square } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useRecording } from '../../contexts/RecordingContext'
import { Button } from '../ui/button'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/recordings', label: 'Recordings', icon: List },
  { to: '/journal', label: 'Journal', icon: BookOpen }
]

function elapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function Sidebar(): React.JSX.Element {
  const { state, startRecording, stopRecording } = useRecording()
  const navigate = useNavigate()
  const isActive = state.status === 'recording' || state.status === 'stopping'

  async function handleRecord(): Promise<void> {
    if (isActive) {
      const meetingId = state.meetingId
      await stopRecording()
      if (meetingId) navigate(`/recordings/${meetingId}`)
    } else {
      await startRecording(true)
    }
  }

  return (
    <nav className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      {/* Traffic light spacer */}
      <div
        className="h-10 w-full shrink-0 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* App name */}
      <div className="px-4 pb-3 font-display text-[15px] font-normal italic text-foreground/70 tracking-wide">
        Briefly
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-0.5 px-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              )
            }
          >
            <Icon size={15} strokeWidth={1.6} />
            {label}
          </NavLink>
        ))}
      </div>

      <div className="flex-1" />

      {/* Recording controls */}
      <div className="border-t border-border px-3 py-3">
        {isActive ? (
          <div className="flex flex-col gap-2">
            <div
              className="flex items-center gap-2 text-xs font-medium"
              style={{ color: 'var(--briefly-record)' }}
            >
              <Circle
                size={7}
                className="recording-dot"
                style={{ fill: 'var(--briefly-record)', color: 'var(--briefly-record)' }}
              />
              <span className="font-mono">{elapsed(state.elapsed)}</span>
              <span className="text-muted-foreground font-normal">recording</span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => void handleRecord()}
              disabled={state.status === 'stopping'}
            >
              <Square size={11} />
              {state.status === 'stopping' ? 'Stopping…' : 'Stop'}
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="w-full gap-1.5"
            style={
              state.status === 'idle'
                ? {
                    backgroundColor: 'var(--briefly-accent)',
                    color: 'oklch(0.1 0 0)'
                  }
                : {}
            }
            onClick={() => void handleRecord()}
            disabled={state.status === 'saving'}
          >
            {state.status === 'saving' ? (
              'Saving…'
            ) : (
              <>
                <Circle size={9} style={{ fill: 'currentColor' }} />
                Record
              </>
            )}
          </Button>
        )}
      </div>

      {/* Settings */}
      <div className="border-t border-border px-2 py-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
            )
          }
        >
          <Settings size={15} strokeWidth={1.6} />
          Settings
        </NavLink>
      </div>
    </nav>
  )
}
