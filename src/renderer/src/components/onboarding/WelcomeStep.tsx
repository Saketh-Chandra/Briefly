import React from 'react'
import { motion } from 'motion/react'
import { AlertTriangle } from 'lucide-react'

interface WelcomeStepProps {
  isSupportedOS: boolean | null // null = still loading
}

export default function WelcomeStep({ isSupportedOS }: WelcomeStepProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-7">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-3"
      >
        <h1 className="font-display text-[88px] leading-none italic tracking-tight text-foreground">
          Briefly
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="text-[15px] leading-relaxed text-muted-foreground"
        >
          Your meetings, summarised privately.
        </motion.p>
      </motion.div>

      {isSupportedOS === false && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-left max-w-sm"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-[12px] leading-relaxed text-amber-400/80">
            System audio capture requires macOS 14.2 Sonoma or later. Transcription of
            microphone-only recordings will still work.
          </p>
        </motion.div>
      )}
    </div>
  )
}
