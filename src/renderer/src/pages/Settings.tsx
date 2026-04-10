import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, Loader2, FolderOpen, Trash2, Download, X, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Separator } from '../components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogFooter
} from '../components/ui/dialog'
import type { ProxySettings } from '../../../main/lib/types'

const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo (~1.6 GB)' },
  { id: 'onnx-community/whisper-base',           label: 'Whisper Base (~75 MB)' },
  { id: 'onnx-community/whisper-tiny',           label: 'Whisper Tiny (~38 MB)' },
]

const LANGUAGES = [
  'english', 'auto', 'spanish', 'french', 'german',
  'italian', 'portuguese', 'dutch', 'japanese', 'chinese',
]

async function checkBrowserCache(modelId: string): Promise<boolean> {
  if (!('caches' in window)) return false
  try {
    const cache = await caches.open('briefly-transformers-v2')
    const keys = await cache.keys()
    return keys.some((req) => req.url.includes(modelId))
  } catch {
    return false
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`
}

type TestState = 'idle' | 'loading' | 'ok' | 'error'

export default function Settings(): React.JSX.Element {
  // LLM
  const [baseURL, setBaseURL]       = useState('')
  const [apiKey, setApiKey]         = useState('')
  const [model, setModel]           = useState('gpt-4o')
  const [apiVersion, setApiVersion] = useState('')
  const [testState, setTestState]   = useState<TestState>('idle')
  const [testError, setTestError]   = useState('')

  // Whisper
  const [whisperModel, setWhisperModel] = useState('onnx-community/whisper-large-v3-turbo')
  const [whisperLang, setWhisperLang]   = useState('english')
  const [modelPresent, setModelPresent] = useState(false)
  const [modelSize, setModelSize]       = useState(0)
  const [dlState, setDlState]           = useState<'idle' | 'downloading' | 'done' | 'error'>('idle')
  const [dlProgress, setDlProgress]     = useState(0)
  const [dlError, setDlError]           = useState('')
  const dlWorkerRef                     = useRef<Worker | null>(null)

  // Storage
  const [diskUsage, setDiskUsage] = useState(0)
  const [userData, setUserData]   = useState('')
  const [clearOpen, setClearOpen] = useState(false)

  // Advanced
  const [hfEndpoint, setHfEndpoint] = useState('')
  const [advOpen, setAdvOpen]       = useState(false)
  const [pingState, setPingState]   = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [pingError, setPingError]   = useState('')

  // Proxy
  type ProxyMode = ProxySettings['mode']
  const [proxyMode, setProxyMode]         = useState<ProxyMode>('system')
  const [httpProxy, setHttpProxy]         = useState('')
  const [httpPort, setHttpPort]           = useState('')
  const [useHttpForHttps, setUseHttpForHttps] = useState(false)
  const [httpsProxy, setHttpsProxy]       = useState('')
  const [httpsPort, setHttpsPort]         = useState('')
  const [socksHost, setSocksHost]         = useState('')
  const [socksPort, setSocksPort]         = useState('')
  const [socksVersion, setSocksVersion]   = useState<4 | 5>(5)
  const [proxyDnsViaSocks, setProxyDnsViaSocks] = useState(false)
  const [pacUrl, setPacUrl]               = useState('')
  const [noProxy, setNoProxy]             = useState('')

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setBaseURL(s.llm.baseURL)
      setModel(s.llm.model)
      setApiVersion(s.llm.apiVersion ?? '')
      if (s.whisperModel) setWhisperModel(s.whisperModel)
      if (s.whisperLanguage) setWhisperLang(s.whisperLanguage)
      if (s.hfEndpoint) setHfEndpoint(s.hfEndpoint)
      if (s.proxy) {
        const p = s.proxy
        setProxyMode(p.mode)
        setHttpProxy(p.httpProxy ?? '')
        setHttpPort(p.httpPort != null ? String(p.httpPort) : '')
        setUseHttpForHttps(p.useHttpForHttps ?? false)
        setHttpsProxy(p.httpsProxy ?? '')
        setHttpsPort(p.httpsPort != null ? String(p.httpsPort) : '')
        setSocksHost(p.socksHost ?? '')
        setSocksPort(p.socksPort != null ? String(p.socksPort) : '')
        setSocksVersion(p.socksVersion ?? 5)
        setProxyDnsViaSocks(p.proxyDnsViaSocks ?? false)
        setPacUrl(p.pacUrl ?? '')
        setNoProxy(p.noProxy ?? '')
      }
    }).catch(console.error)

    window.api.getDiskUsage().then((d) => {
      setDiskUsage(d.audioBytes)
      setUserData(d.userData)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    setDlState('idle')
    setDlProgress(0)
    setDlError('')
    // First check filesystem (fast); if absent, check browser Cache API
    // (model files are stored there when useBrowserCache=true in the worker).
    window.api.getModelStatus(whisperModel).then(async (s) => {
      if (s.present) {
        setModelPresent(true)
        setModelSize(s.sizeBytes)
      } else {
        const cached = await checkBrowserCache(whisperModel)
        setModelPresent(cached)
      }
    }).catch(console.error)
  }, [whisperModel])

  async function handleSaveLlm(): Promise<void> {
    await window.api.saveSettings({
      llm: { baseURL, model, ...(apiVersion ? { apiVersion } : {}) },
      ...(apiKey ? { llmApiKey: apiKey } : {})
    })
    if (apiKey) setApiKey('')
  }

  async function handleTest(): Promise<void> {
    setTestState('loading')
    setTestError('')
    try {
      await window.api.testLlmConnection()
      setTestState('ok')
    } catch (err) {
      setTestState('error')
      setTestError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSaveWhisper(): Promise<void> {
    await window.api.saveSettings({ whisperModel, whisperLanguage: whisperLang })
  }

  async function handleSaveProxy(): Promise<void> {
    const proxy: ProxySettings = { mode: proxyMode }
    if (proxyMode === 'manual') {
      if (httpProxy.trim() && httpPort.trim()) {
        proxy.httpProxy = httpProxy.trim()
        proxy.httpPort  = parseInt(httpPort) || 3128
        proxy.useHttpForHttps = useHttpForHttps
      }
      if (!useHttpForHttps && httpsProxy.trim() && httpsPort.trim()) {
        proxy.httpsProxy = httpsProxy.trim()
        proxy.httpsPort  = parseInt(httpsPort) || 3128
      }
      if (socksHost.trim() && socksPort.trim()) {
        proxy.socksHost    = socksHost.trim()
        proxy.socksPort    = parseInt(socksPort) || 1080
        proxy.socksVersion = socksVersion
        proxy.proxyDnsViaSocks = socksVersion === 5 ? proxyDnsViaSocks : false
      }
      if (noProxy.trim()) proxy.noProxy = noProxy.trim()
    }
    if (proxyMode === 'pac') {
      if (pacUrl.trim()) proxy.pacUrl = pacUrl.trim()
      if (noProxy.trim()) proxy.noProxy = noProxy.trim()
    }
    await window.api.saveSettings({ proxy })
  }

  async function handleDeleteModel(): Promise<void> {
    await window.api.deleteModel(whisperModel)
    setModelPresent(false)
    setModelSize(0)
  }

  async function handleDownloadModel(): Promise<void> {
    if (dlState === 'downloading') return
    setDlState('downloading')
    setDlProgress(0)
    setDlError('')

    try {
      const { modelCachePath } = await window.api.getPaths()

      if (dlWorkerRef.current) dlWorkerRef.current.terminate()
      const worker = new Worker(
        new URL('../workers/whisper.worker.ts', import.meta.url),
        { type: 'module' }
      )
      dlWorkerRef.current = worker

      await new Promise<void>((resolve, reject) => {
        worker.onmessage = (e) => {
          const msg = e.data
          if (msg.type === 'model_loading') setDlProgress(msg.progress ?? 0)
          if (msg.type === 'model_ready') resolve()
          if (msg.type === 'error') reject(new Error(msg.message))
        }
        worker.onerror = (e) => reject(new Error(e.message))
        worker.postMessage({
          type: 'init',
          modelId: whisperModel,
          modelCachePath,
          ...(hfEndpoint ? { hfEndpoint } : {}),
        })
      })

      worker.terminate()
      dlWorkerRef.current = null

      // Trust the model_ready event — don't call getModelStatus which checks
      // the filesystem (always empty; model lives in the browser Cache API).
      setModelPresent(true)
      setDlState('done')
      setDlProgress(100)

      const label = WHISPER_MODELS.find((m) => m.id === whisperModel)?.label ?? whisperModel
      window.api.showNotification('Model downloaded', `${label} is ready to use.`)
    } catch (err) {
      dlWorkerRef.current?.terminate()
      dlWorkerRef.current = null
      const message = err instanceof Error ? err.message : String(err)
      setDlState('error')
      setDlError(message)

      const label = WHISPER_MODELS.find((m) => m.id === whisperModel)?.label ?? whisperModel
      window.api.showNotification(
        `Download failed — ${label}`,
        message.length > 200 ? message.slice(0, 200) + '…' : message
      )
    }
  }

  async function handleTestMirror(): Promise<void> {
    if (!hfEndpoint || pingState === 'testing') return
    setPingState('testing')
    setPingError('')
    try {
      const result = await window.api.testMirror(hfEndpoint.trim())
      if (result.ok) {
        setPingState('ok')
      } else {
        setPingState('error')
        setPingError(result.error ?? 'Unreachable')
      }
    } catch (err) {
      setPingState('error')
      setPingError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleCancelDownload(): void {
    dlWorkerRef.current?.terminate()
    dlWorkerRef.current = null
    setDlState('idle')
    setDlProgress(0)
    setDlError('')

    const label = WHISPER_MODELS.find((m) => m.id === whisperModel)?.label ?? whisperModel
    window.api.showNotification('Download cancelled', `${label} download was stopped.`)
  }

  async function handleClearAll(): Promise<void> {
    await window.api.clearAllRecordings()
    setDiskUsage(0)
    setClearOpen(false)
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="mb-8 font-display text-2xl italic text-foreground/80">Settings</h1>

      {/* ── LLM ───────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          LLM Configuration
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baseURL">Base URL</Label>
            <Input
              id="baseURL"
              placeholder="https://api.openai.com/v1"
              value={baseURL}
              onChange={(e) => { setBaseURL(e.target.value); setTestState('idle') }}
            />
            <p className="text-[11px] text-muted-foreground">
              Azure: <code>https://&lt;resource&gt;.openai.azure.com/openai/deployments/&lt;model&gt;</code>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Saved in macOS Keychain — paste to update"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="llmModel">Model</Label>
              <Input
                id="llmModel"
                placeholder="gpt-4o"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apiVersion">
                API Version <span className="text-muted-foreground">(Azure)</span>
              </Label>
              <Input
                id="apiVersion"
                placeholder="2025-01-01-preview"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={() => void handleSaveLlm()}>Save</Button>
            <Button variant="outline" onClick={() => void handleTest()} disabled={testState === 'loading'}>
              {testState === 'loading' && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Test Connection
            </Button>
            {testState === 'ok' && (
              <span className="flex items-center gap-1 text-sm text-green-500">
                <CheckCircle size={13} /> Connected
              </span>
            )}
            {testState === 'error' && (
              <span className="flex items-center gap-1 text-sm text-destructive" title={testError}>
                <XCircle size={13} />
                {testError.length > 60 ? testError.slice(0, 60) + '…' : testError}
              </span>
            )}
          </div>
        </div>
      </section>

      <Separator className="mb-8" />

      {/* ── Whisper ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Transcription (Whisper)
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Model</Label>
            <Select value={whisperModel} onValueChange={setWhisperModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WHISPER_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {modelPresent
                ? `Downloaded · ${formatBytes(modelSize)}`
                : 'Not downloaded — will download automatically on first transcription'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Language</Label>
            <Select value={whisperLang} onValueChange={setWhisperLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Download progress bar */}
          {dlState === 'downloading' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" />
                  Downloading… {dlProgress}%
                  {hfEndpoint && (
                    <span className="text-muted-foreground/50">
                      via <code>{hfEndpoint}</code>
                    </span>
                  )}
                </span>
                <button
                  onClick={handleCancelDownload}
                  className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={11} /> Cancel
                </button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${dlProgress}%` }}
                />
              </div>
            </div>
          )}
          {dlState === 'error' && (
            <div className="flex flex-col gap-1">
              <p className="flex items-start gap-1 text-[11px] text-destructive">
                <XCircle size={11} className="mt-0.5 shrink-0" />
                <span>{dlError}</span>
              </p>
              {(dlError.includes('blocked') || dlError.includes('mirror') || dlError.includes('not valid JSON') || dlError.includes('<!doctype')) && (
                <p className="text-[11px] text-muted-foreground pl-4">
                  Tip: set a mirror URL in the{' '}
                  <button
                    className="underline hover:text-foreground transition-colors"
                    onClick={() => setAdvOpen(true)}
                  >
                    Advanced
                  </button>{' '}section (e.g. <code>https://hf-mirror.com</code>).
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => void handleSaveWhisper()}>Save</Button>
            {!modelPresent && dlState !== 'downloading' && (
              <Button variant="outline" onClick={() => void handleDownloadModel()}>
                <Download size={13} className="mr-1.5" />
                Download Model
              </Button>
            )}
            {modelPresent && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => void handleDeleteModel()}
              >
                <Trash2 size={13} className="mr-1.5" />
                Delete Model
              </Button>
            )}
          </div>
        </div>
      </section>

      <Separator className="mb-8" />

      {/* ── Storage ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Storage
        </h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">App data folder</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{userData}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 h-7 w-7 shrink-0"
              onClick={() => void window.api.revealInFinder()}
              title="Reveal in Finder"
            >
              <FolderOpen size={13} />
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Audio recordings</p>
              <p className="text-[11px] text-muted-foreground">{formatBytes(diskUsage)} used</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setClearOpen(true)}
            >
              Clear all
            </Button>
          </div>
        </div>
      </section>

      <Separator className="mb-8" />

      {/* ── Advanced (collapsible) ─────────────────────────── */}
      <section className="mb-8">
        <button
          onClick={() => setAdvOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          {advOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Advanced
        </button>
        {advOpen && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hfEndpoint">HuggingFace Mirror URL</Label>
              <Input
                id="hfEndpoint"
                placeholder="https://hf-mirror.com"
                value={hfEndpoint}
                onChange={(e) => { setHfEndpoint(e.target.value); setPingState('idle') }}
              />
              <p className="text-[11px] text-muted-foreground">
                Override the default <code>huggingface.co</code> host for model downloads.
                Leave blank to use the official endpoint. Takes effect on the next download.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                className="self-start"
                onClick={() => {
                  const normalised = hfEndpoint.trim().replace(/\/$/, '')
                  setHfEndpoint(normalised)
                  void window.api.saveSettings({ hfEndpoint: normalised || undefined })
                }}
              >
                Save
              </Button>
              <Button
                variant="outline"
                className="self-start"
                disabled={!hfEndpoint || pingState === 'testing'}
                onClick={() => void handleTestMirror()}
              >
                {pingState === 'testing' && <Loader2 size={13} className="mr-1.5 animate-spin" />}
                Test
              </Button>
              {pingState === 'ok' && (
                <span className="flex items-center gap-1 text-[12px] text-green-500">
                  <CheckCircle size={13} /> Reachable
                </span>
              )}
              {pingState === 'error' && (
                <span className="flex items-center gap-1 text-[12px] text-destructive" title={pingError}>
                  <XCircle size={13} />
                  {pingError.length > 60 ? pingError.slice(0, 60) + '…' : pingError}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <Separator className="mb-8" />

      {/* ── Proxy ─────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Proxy Configuration
        </h2>
        <div className="flex flex-col gap-3">

          {/* Mode radio buttons */}
          <div className="flex flex-col gap-2">
            {([
              { value: 'none',        label: 'No proxy' },
              { value: 'auto_detect', label: 'Auto-detect proxy settings for this network' },
              { value: 'system',      label: 'Use system proxy settings' },
              { value: 'manual',      label: 'Manual proxy configuration' },
              { value: 'pac',         label: 'Automatic proxy configuration URL' },
            ] as { value: ProxyMode; label: string }[]).map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="proxyMode"
                  value={value}
                  checked={proxyMode === value}
                  onChange={() => setProxyMode(value)}
                  className="accent-primary"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>

          {/* Manual sub-section */}
          {proxyMode === 'manual' && (
            <div className="mt-1 flex flex-col gap-3 border-l border-border/50 pl-4">

              {/* HTTP Proxy */}
              <div className="grid grid-cols-[1fr_80px] gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="httpProxy" className="text-[11px]">HTTP Proxy</Label>
                  <Input id="httpProxy" placeholder="proxy.example.com" value={httpProxy} onChange={(e) => setHttpProxy(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="httpPort" className="text-[11px]">Port</Label>
                  <Input id="httpPort" placeholder="3128" value={httpPort} onChange={(e) => setHttpPort(e.target.value)} />
                </div>
              </div>

              {/* Also use for HTTPS */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={useHttpForHttps} onChange={(e) => setUseHttpForHttps(e.target.checked)} className="accent-primary" />
                <span className="text-sm">Also use this proxy for HTTPS</span>
              </label>

              {/* HTTPS Proxy */}
              <div className={`grid grid-cols-[1fr_80px] gap-2 items-end transition-opacity ${useHttpForHttps ? 'opacity-40 pointer-events-none' : ''}`}>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="httpsProxy" className="text-[11px]">HTTPS Proxy</Label>
                  <Input id="httpsProxy" placeholder="proxy.example.com" value={httpsProxy} onChange={(e) => setHttpsProxy(e.target.value)} disabled={useHttpForHttps} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="httpsPort" className="text-[11px]">Port</Label>
                  <Input id="httpsPort" placeholder="3128" value={httpsPort} onChange={(e) => setHttpsPort(e.target.value)} disabled={useHttpForHttps} />
                </div>
              </div>

              {/* SOCKS Host */}
              <div className="grid grid-cols-[1fr_80px] gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="socksHost" className="text-[11px]">SOCKS Host</Label>
                  <Input id="socksHost" placeholder="proxy.example.com" value={socksHost} onChange={(e) => setSocksHost(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="socksPort" className="text-[11px]">Port</Label>
                  <Input id="socksPort" placeholder="1080" value={socksPort} onChange={(e) => setSocksPort(e.target.value)} />
                </div>
              </div>

              {/* SOCKS version */}
              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="radio" name="socksVersion" value="4" checked={socksVersion === 4} onChange={() => setSocksVersion(4)} className="accent-primary" />
                  <span className="text-sm">SOCKS v4</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="radio" name="socksVersion" value="5" checked={socksVersion === 5} onChange={() => setSocksVersion(5)} className="accent-primary" />
                  <span className="text-sm">SOCKS v5</span>
                </label>
              </div>

              {/* Proxy DNS via SOCKS v5 */}
              <label className={`flex items-center gap-2 cursor-pointer select-none transition-opacity ${socksVersion === 4 ? 'opacity-40 pointer-events-none' : ''}`}>
                <input type="checkbox" checked={proxyDnsViaSocks} onChange={(e) => setProxyDnsViaSocks(e.target.checked)} disabled={socksVersion === 4} className="accent-primary" />
                <span className="text-sm">Proxy DNS when using SOCKS v5</span>
              </label>
            </div>
          )}

          {/* PAC URL sub-section */}
          {proxyMode === 'pac' && (
            <div className="mt-1 border-l border-border/50 pl-4">
              <Input
                placeholder="http://intranet.example.com/proxy.pac"
                value={pacUrl}
                onChange={(e) => setPacUrl(e.target.value)}
              />
            </div>
          )}

          {/* No proxy for (manual + pac only) */}
          {(proxyMode === 'manual' || proxyMode === 'pac') && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="noProxy" className="text-[11px]">No proxy for</Label>
              <Input
                id="noProxy"
                placeholder="localhost,127.0.0.1"
                value={noProxy}
                onChange={(e) => setNoProxy(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Comma-separated hosts or IPs that bypass the proxy.
                Connections to localhost and 127.0.0.1 are never proxied.
              </p>
            </div>
          )}

          <Button className="self-start mt-1" onClick={() => void handleSaveProxy()}>Save</Button>
        </div>
      </section>

      <Separator className="mb-8" />

      {/* ── About ─────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          About
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Briefly — local meeting transcription &amp; summarisation.<br />
          Built with Electron, React, Whisper (ONNX/WebGPU), and an OpenAI-compatible LLM.
        </p>
      </section>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all recordings?</DialogTitle>
            <DialogDescription>
              This will permanently delete all audio files, transcripts, summaries, and journal entries. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleClearAll()}>Delete Everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

