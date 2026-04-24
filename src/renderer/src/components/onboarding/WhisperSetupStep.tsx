import React, { useState, useRef, useEffect } from 'react'
import { Download, X, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-tiny', label: 'Whisper Tiny', size: '~38 MB' },
  { id: 'onnx-community/whisper-base', label: 'Whisper Base', size: '~75 MB' },
  { id: 'onnx-community/whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo', size: '~1.6 GB' }
]

interface WhisperSetupStepProps {
  selectedModel: string
  onModelChange: (id: string) => void
  onReady: (ready: boolean) => void
}

export default function WhisperSetupStep({
  selectedModel,
  onModelChange,
  onReady
}: WhisperSetupStepProps): React.JSX.Element {
  const [dlState, setDlState] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle')
  const [dlProgress, setDlProgress] = useState(0)
  const [dlError, setDlError] = useState('')
  const dlWorkerRef = useRef<Worker | null>(null)

  function handleModelSelectionChange(modelId: string): void {
    onModelChange(modelId)
    setDlState('idle')
    setDlProgress(0)
    setDlError('')
    onReady(false)
  }

  // Check if already cached in browser cache
  useEffect(() => {
    let mounted = true
    if (!('caches' in window)) return

    void caches
      .open('briefly-transformers-v2')
      .then((cache) => cache.keys())
      .then((keys) => {
        if (!mounted) return
        if (keys.some((req) => req.url.includes(selectedModel))) {
          setDlState('done')
          setDlProgress(100)
          onReady(true)
        }
      })
      .catch(() => {
        // ignore
      })

    return () => {
      mounted = false
    }
  }, [selectedModel, onReady])

  async function handleDownload(): Promise<void> {
    if (dlState === 'downloading') return
    setDlState('downloading')
    setDlProgress(0)
    setDlError('')
    onReady(false)

    try {
      const { modelCachePath } = await window.api.getPaths()
      if (dlWorkerRef.current) dlWorkerRef.current.terminate()
      const worker = new Worker(new URL('../../workers/whisper.worker.ts', import.meta.url), {
        type: 'module'
      })
      dlWorkerRef.current = worker

      await new Promise<void>((resolve, reject) => {
        worker.onmessage = (e) => {
          const msg = e.data
          if (msg.type === 'model_loading') setDlProgress(msg.progress ?? 0)
          if (msg.type === 'model_ready') resolve()
          if (msg.type === 'error') reject(new Error(msg.message))
        }
        worker.onerror = (e) => reject(new Error(e.message))
        worker.postMessage({ type: 'init', modelId: selectedModel, modelCachePath })
      })

      worker.terminate()
      dlWorkerRef.current = null
      setDlState('done')
      setDlProgress(100)
      onReady(true)
    } catch (err) {
      dlWorkerRef.current?.terminate()
      dlWorkerRef.current = null
      setDlState('error')
      setDlError(err instanceof Error ? err.message : String(err))
      onReady(false)
    }
  }

  function handleCancel(): void {
    dlWorkerRef.current?.terminate()
    dlWorkerRef.current = null
    setDlState('idle')
    setDlProgress(0)
    setDlError('')
    onReady(false)
  }

  const selected = WHISPER_MODELS.find((m) => m.id === selectedModel)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
          Step 3 of 5
        </p>
        <h2 className="font-display text-[32px] leading-tight italic text-foreground/90">
          Download a Whisper model
        </h2>
        <p className="text-sm text-muted-foreground">
          Whisper runs entirely on your machine — audio never leaves. Tiny is fastest; Large v3
          Turbo is most accurate.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Model</Label>
          <Select value={selectedModel} onValueChange={handleModelSelectionChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WHISPER_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span>{m.label}</span>
                  <span className="ml-2 text-muted-foreground">{m.size}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {dlState === 'idle' && (
          <Button variant="outline" onClick={() => void handleDownload()} className="w-fit">
            <Download size={13} className="mr-1.5" />
            Download {selected?.label} ({selected?.size})
          </Button>
        )}

        {dlState === 'downloading' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                Downloading… {dlProgress}%
              </span>
              <button
                onClick={handleCancel}
                className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={11} /> Cancel
              </button>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${dlProgress}%` }}
              />
            </div>
          </div>
        )}

        {dlState === 'done' && (
          <p className="flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle size={14} />
            {selected?.label} ({selected?.size}) is ready
          </p>
        )}

        {dlState === 'error' && (
          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-1.5 text-[12px] text-destructive">
              <XCircle size={12} className="mt-0.5 shrink-0" />
              <span>{dlError.length > 140 ? dlError.slice(0, 140) + '…' : dlError}</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDownload()}
              className="w-fit"
            >
              Retry Download
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
