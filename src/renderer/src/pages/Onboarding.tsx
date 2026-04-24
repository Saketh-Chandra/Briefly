import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import WelcomeStep from '../components/onboarding/WelcomeStep'
import LlmSetupStep from '../components/onboarding/LlmSetupStep'
import WhisperSetupStep from '../components/onboarding/WhisperSetupStep'
import PermissionsStep from '../components/onboarding/PermissionsStep'
import ReadyStep from '../components/onboarding/ReadyStep'

const TOTAL_STEPS = 5

// Darwin 23.2+ = macOS 14.2 Sonoma (required for loopback audio)
function isSupportedVersion(darwinVersion: string): boolean {
  const parts = darwinVersion.split('.').map(Number)
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  return major > 23 || (major === 23 && minor >= 2)
}

export default function Onboarding(): React.JSX.Element {
  const navigate = useNavigate()

  const [step, setStep] = useState(0)

  // OS check
  const [supportedOS, setSupportedOS] = useState<boolean | null>(null)

  // LLM config
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const [apiVersion, setApiVersion] = useState('')

  // Whisper
  const [whisperModel, setWhisperModel] = useState('onnx-community/whisper-tiny')
  const [whisperReady, setWhisperReady] = useState(false)

  // Permissions
  const [permissions, setPermissions] = useState<{ screen: string; mic: string }>({
    screen: 'unknown',
    mic: 'unknown'
  })

  useEffect(() => {
    window.api
      .getOsInfo()
      .then(({ darwinVersion }) => setSupportedOS(isSupportedVersion(darwinVersion)))
      .catch(() => setSupportedOS(true))
  }, [])

  // Refresh permissions whenever the user reaches the permissions step
  useEffect(() => {
    if (step === 3) {
      window.api
        .checkPermissions()
        .then(setPermissions)
        .catch(() => {})
    }
  }, [step])

  async function refreshPermissions(): Promise<void> {
    const p = await window.api.checkPermissions()
    setPermissions(p)
  }

  function advance(): void {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }

  async function handleComplete(): Promise<void> {
    if (baseURL.trim()) {
      await window.api.saveSettings({
        llm: { baseURL, model, ...(apiVersion ? { apiVersion } : {}) },
        ...(apiKey ? { llmApiKey: apiKey } : {})
      })
    }
    await window.api.saveSettings({
      whisperModel,
      onboardingComplete: true
    })
    navigate('/', { replace: true })
  }

  const isWelcome = step === 0
  const isLastStep = step === TOTAL_STEPS - 1
  const isSkippable = step === 1 || step === 2
  const llmConfigured = baseURL.trim().length > 0

  function renderStep(): React.ReactNode {
    switch (step) {
      case 0:
        return <WelcomeStep isSupportedOS={supportedOS} />
      case 1:
        return (
          <LlmSetupStep
            baseURL={baseURL}
            apiKey={apiKey}
            model={model}
            apiVersion={apiVersion}
            onBaseURLChange={setBaseURL}
            onApiKeyChange={setApiKey}
            onModelChange={setModel}
            onApiVersionChange={setApiVersion}
          />
        )
      case 2:
        return (
          <WhisperSetupStep
            selectedModel={whisperModel}
            onModelChange={setWhisperModel}
            onReady={setWhisperReady}
          />
        )
      case 3:
        return <PermissionsStep permissions={permissions} onRefresh={refreshPermissions} />
      case 4:
        return (
          <ReadyStep
            llmConfigured={llmConfigured}
            whisperReady={whisperReady}
            screenPermission={permissions.screen}
            micPermission={permissions.mic}
          />
        )
      default:
        return null
    }
  }

  const ctaLabel = isLastStep ? 'Start Recording' : isWelcome ? 'Get Started' : 'Continue'

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden text-foreground select-none"
      style={{
        background: `
          radial-gradient(ellipse 800px 500px at 50% 38%, oklch(0.78 0.16 60 / 0.07) 0%, transparent 70%),
          var(--color-background)
        `
      }}
    >
      {/* macOS traffic-light drag region */}
      <div
        className="h-10 w-full shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Step content */}
      <div className="flex flex-1 items-center justify-center px-8 overflow-hidden">
        <div className={cn('w-full', isWelcome ? 'max-w-lg text-center' : 'max-w-[440px]')}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 44 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -44 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34, mass: 0.85 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-8 pb-8 pt-4">
        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <motion.div
              key={i}
              animate={{
                width: i === step ? 20 : 6,
                opacity: i <= step ? 1 : 0.3
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={cn(
                'h-1.5 rounded-full',
                i <= step ? 'bg-[--briefly-accent]' : 'bg-border'
              )}
              style={{ width: i === step ? 20 : 6 }}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-5">
          {isSkippable && (
            <button
              onClick={advance}
              className="text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Skip for now
            </button>
          )}
          <Button
            onClick={isLastStep ? () => void handleComplete() : advance}
            className="gap-1.5 px-5"
          >
            {ctaLabel}
            {!isLastStep && <ArrowRight size={13} />}
          </Button>
        </div>
      </div>
    </div>
  )
}
