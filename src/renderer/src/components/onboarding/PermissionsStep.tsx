import React from 'react'
import { Monitor, Mic, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '../ui/button'

interface PermissionsStepProps {
  permissions: { screen: string; mic: string }
  onRefresh: () => Promise<void>
}

export default function PermissionsStep({
  permissions,
  onRefresh
}: PermissionsStepProps): React.JSX.Element {
  const screenGranted = permissions.screen === 'granted'
  const micGranted = permissions.mic === 'granted'

  async function handleGrantMic(): Promise<void> {
    await window.api.requestMicPermission()
    await onRefresh()
  }

  async function handleOpenScreenSettings(): Promise<void> {
    await window.api.openScreenRecordingSettings()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
          Step 4 of 5
        </p>
        <h2 className="font-display text-[32px] leading-tight italic text-foreground/90">
          Grant permissions
        </h2>
        <p className="text-sm text-muted-foreground">
          Briefly needs system access to record your meetings.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Screen Recording */}
        <div className="flex items-center gap-4 rounded-lg border border-border/60 px-4 py-3">
          <Monitor size={16} className="shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Screen Recording</p>
            <p className="text-[11px] text-muted-foreground">Required to capture system audio.</p>
          </div>
          {screenGranted ? (
            <span className="flex items-center gap-1 text-[12px] text-green-500 shrink-0">
              <CheckCircle size={13} /> Granted
            </span>
          ) : (
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <AlertCircle size={11} />
                {permissions.screen === 'denied' ? 'Denied' : 'Not granted'}
              </span>
              <Button size="sm" variant="outline" onClick={() => void handleOpenScreenSettings()}>
                Open Settings
              </Button>
            </div>
          )}
        </div>

        {/* Microphone */}
        <div className="flex items-center gap-4 rounded-lg border border-border/60 px-4 py-3">
          <Mic size={16} className="shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Microphone</p>
            <p className="text-[11px] text-muted-foreground">
              Optional — mix your voice with system audio.
            </p>
          </div>
          {micGranted ? (
            <span className="flex items-center gap-1 text-[12px] text-green-500 shrink-0">
              <CheckCircle size={13} /> Granted
            </span>
          ) : (
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <AlertCircle size={11} />
                {permissions.mic === 'denied' ? 'Denied' : 'Not granted'}
              </span>
              <Button size="sm" variant="outline" onClick={() => void handleGrantMic()}>
                Grant
              </Button>
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/40">
        Permissions can be changed at any time in System Settings → Privacy &amp; Security.
      </p>
    </div>
  )
}
