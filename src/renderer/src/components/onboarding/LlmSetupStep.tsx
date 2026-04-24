import React from 'react'
import LlmFields from '../LlmFields'
import type { LlmFieldsProps } from '../LlmFields'

type LlmSetupStepProps = Omit<LlmFieldsProps, 'onSave' | 'showSave'>

export default function LlmSetupStep(props: LlmSetupStepProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
          Step 2 of 5
        </p>
        <h2 className="font-display text-[32px] leading-tight italic text-foreground/90">
          Connect your LLM
        </h2>
        <p className="text-sm text-muted-foreground">
          Any OpenAI-compatible endpoint. Summaries, to-dos, and journal entries are generated here
          — nothing else leaves your machine.
        </p>
      </div>

      <LlmFields {...props} showSave={false} />
    </div>
  )
}
