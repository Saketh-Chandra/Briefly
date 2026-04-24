import React from 'react'
import { motion } from 'motion/react'
import { CheckCircle, Circle, AlertCircle } from 'lucide-react'

interface ReadyStepProps {
  llmConfigured: boolean
  whisperReady: boolean
  screenPermission: string
  micPermission: string
}

type RowStatus = 'ok' | 'skip' | 'warn'

function SummaryRow({
  label,
  status,
  detail
}: {
  label: string
  status: RowStatus
  detail: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      {status === 'ok' && <CheckCircle size={14} className="shrink-0 text-green-500" />}
      {status === 'skip' && <Circle size={14} className="shrink-0 text-muted-foreground/30" />}
      {status === 'warn' && <AlertCircle size={14} className="shrink-0 text-amber-400" />}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-sm text-foreground shrink-0">{label}</span>
        <span className="text-[11px] text-muted-foreground truncate">{detail}</span>
      </div>
    </div>
  )
}

export default function ReadyStep({
  llmConfigured,
  whisperReady,
  screenPermission,
  micPermission
}: ReadyStepProps): React.JSX.Element {
  const screenGranted = screenPermission === 'granted'
  const micGranted = micPermission === 'granted'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
          Step 5 of 5
        </p>
        <h2 className="font-display text-[32px] leading-tight italic text-foreground/90">
          You&apos;re ready.
        </h2>
        <p className="text-sm text-muted-foreground">
          Everything can be changed at any time in Settings.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-3 rounded-lg border border-border/60 px-4 py-4"
      >
        <SummaryRow
          label="LLM"
          status={llmConfigured ? 'ok' : 'skip'}
          detail={llmConfigured ? 'Configured' : 'Skipped — add in Settings'}
        />
        <SummaryRow
          label="Whisper model"
          status={whisperReady ? 'ok' : 'skip'}
          detail={whisperReady ? 'Downloaded' : 'Skipped — downloads automatically on first use'}
        />
        <SummaryRow
          label="Screen Recording"
          status={screenGranted ? 'ok' : 'warn'}
          detail={screenGranted ? 'Granted' : 'Not granted — required for system audio'}
        />
        <SummaryRow
          label="Microphone"
          status={micGranted ? 'ok' : 'skip'}
          detail={micGranted ? 'Granted' : 'Not granted — optional'}
        />
      </motion.div>
    </div>
  )
}
