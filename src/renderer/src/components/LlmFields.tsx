import React, { useState } from 'react'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

type TestState = 'idle' | 'loading' | 'ok' | 'error'

export interface LlmFieldsProps {
  baseURL: string
  apiKey: string
  model: string
  apiVersion: string
  onBaseURLChange: (v: string) => void
  onApiKeyChange: (v: string) => void
  onModelChange: (v: string) => void
  onApiVersionChange: (v: string) => void
  onSave?: () => Promise<void>
  showSave?: boolean
}

export default function LlmFields({
  baseURL,
  apiKey,
  model,
  apiVersion,
  onBaseURLChange,
  onApiKeyChange,
  onModelChange,
  onApiVersionChange,
  onSave,
  showSave = true
}: LlmFieldsProps): React.JSX.Element {
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState('')

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="llm-baseURL">Base URL</Label>
        <Input
          id="llm-baseURL"
          placeholder="https://api.openai.com/v1"
          value={baseURL}
          onChange={(e) => {
            onBaseURLChange(e.target.value)
            setTestState('idle')
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Azure:{' '}
          <code>https://&lt;resource&gt;.openai.azure.com/openai/deployments/&lt;model&gt;</code>
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="llm-apiKey">API Key</Label>
        <Input
          id="llm-apiKey"
          type="password"
          placeholder="Saved in macOS Keychain — paste to update"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="llm-model">Model</Label>
          <Input
            id="llm-model"
            placeholder="gpt-4o"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="llm-apiVersion">
            API Version <span className="text-muted-foreground">(Azure)</span>
          </Label>
          <Input
            id="llm-apiVersion"
            placeholder="2025-01-01-preview"
            value={apiVersion}
            onChange={(e) => onApiVersionChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {showSave && onSave && <Button onClick={() => void onSave()}>Save</Button>}
        <Button
          variant="outline"
          onClick={() => void handleTest()}
          disabled={testState === 'loading'}
        >
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
  )
}
