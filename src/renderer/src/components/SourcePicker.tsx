/**
 * SourcePicker — compact source selector shown below the record button.
 * Loads available screens + windows via IPC and lets the user pick one.
 * The chosen source ID is stored in selectedSourceIdAtom.
 *
 * Sources are (re)fetched every time the dropdown opens so the list is fresh
 * and reflects screen-recording permission being granted.
 */
import React, { useState } from 'react'
import { useAtom } from 'jotai'
import { Monitor, AppWindow, ChevronDown, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { selectedSourceIdAtom } from '../atoms/recording'
import type { CaptureSource } from '../../../main/lib/types'

export default function SourcePicker(): React.JSX.Element {
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useAtom(selectedSourceIdAtom)

  async function loadSources(): Promise<void> {
    setLoading(true)
    try {
      const srcs = await window.api.getSources()
      setSources(srcs)
      // Auto-select first screen if nothing chosen yet (or previous choice gone)
      if (srcs.length > 0 && (!selectedId || !srcs.find((s) => s.id === selectedId))) {
        setSelectedId(srcs[0].id)
      }
    } catch (e) {
      console.error('[SourcePicker] getSources failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const selected = sources.find((s) => s.id === selectedId)
  const screens = sources.filter((s) => s.id.startsWith('screen:'))
  const windows = sources.filter((s) => !s.id.startsWith('screen:'))

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void loadSources()
      }}
    >
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-[12px] font-medium text-foreground/70 transition-all hover:border-border/80 hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {loading ? (
            <Loader2 size={12} className="animate-spin text-muted-foreground" />
          ) : (
            <Monitor size={12} className="shrink-0 text-muted-foreground" />
          )}
          <span className="max-w-[180px] truncate">
            {loading ? 'Loading…' : selected ? selected.name : 'Select source…'}
          </span>
          <ChevronDown size={11} className="shrink-0 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="center" className="w-64">
        {loading && (
          <DropdownMenuItem disabled className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            <span className="text-[12px] text-muted-foreground">Loading sources…</span>
          </DropdownMenuItem>
        )}

        {!loading && screens.length > 0 && (
          <>
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Monitor size={10} />
              Screens
            </DropdownMenuLabel>
            {screens.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="flex items-center gap-2"
              >
                {s.thumbnail ? (
                  <img
                    src={s.thumbnail}
                    alt=""
                    className="h-8 w-14 shrink-0 rounded object-cover ring-1 ring-border/30"
                  />
                ) : (
                  <Monitor size={14} className="shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-[12px]">{s.name}</span>
                {s.id === selectedId && (
                  <span className="ml-auto text-[10px] text-muted-foreground">✓</span>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {!loading && windows.length > 0 && (
          <>
            {screens.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <AppWindow size={10} />
              Windows{' '}
              <span className="normal-case tracking-normal opacity-60">
                (visible on this Space)
              </span>
            </DropdownMenuLabel>
            {windows.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="flex items-center gap-2"
              >
                {s.appIcon ? (
                  <img src={s.appIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
                ) : (
                  <AppWindow size={14} className="shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-[12px]">{s.name}</span>
                {s.id === selectedId && (
                  <span className="ml-auto text-[10px] text-muted-foreground">✓</span>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {!loading && sources.length === 0 && (
          <div className="px-3 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">No sources found.</p>
            <p className="mt-1 text-[10px] text-muted-foreground/60">
              Grant Screen Recording permission in System Settings, then reopen this menu.
            </p>
          </div>
        )}

        <div className="border-t border-border/40 px-3 py-2">
          <p className="text-[10px] text-muted-foreground/50">
            System audio is always captured regardless of source. Full-screen apps and windows on
            other Spaces won&apos;t appear — use a Screen source instead.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
