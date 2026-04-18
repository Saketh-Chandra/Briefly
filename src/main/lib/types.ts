// Source info returned by desktopCapturer.getSources
export interface CaptureSource {
  id: string
  name: string
  display_id: string
  thumbnail: string // base64 data URL (160×90 PNG)
  appIcon: string | null // base64 data URL or null
}

// Events emitted by the renderer CaptureSession via BroadcastChannel
export type CaptureEvent =
  | { type: 'ready' }
  | { type: 'status'; state: 'recording' | 'stopping' }
  | { type: 'level'; rms: number }
  | { type: 'screenshot_done'; path: string }
  | { type: 'stopped'; duration_s: number; path: string }
  | { type: 'error'; message: string }

/** @deprecated Use CaptureEvent */
export type CliEvent = CaptureEvent

// Meeting row (from DB)
export interface Meeting {
  id: number
  session_id: string
  title: string | null
  date: string // ISO 8601
  duration_s: number | null
  audio_path: string
  status: MeetingStatus
  created_at: string
  updated_at: string
}

export type MeetingStatus =
  | 'recording'
  | 'recorded'
  | 'transcribing'
  | 'transcribed'
  | 'processing'
  | 'done'
  | 'error'

export interface MeetingDetail extends Meeting {
  transcript: {
    content: string
    chunks: TranscriptChunk[] | null
    model: string | null
  } | null
  summary: {
    summary: string | null
    todos: Todo[] | null
    journal: string | null
  } | null
  screenshots: { path: string; taken_at: string }[]
}

export interface TranscriptChunk {
  start: number
  end: number
  text: string
}

export interface Todo {
  text: string
  owner: string | null
  deadline: string | null
  priority: 'high' | 'medium' | 'low'
  done: boolean
}

export interface ProxySettings {
  mode: 'none' | 'system' | 'auto_detect' | 'manual' | 'pac'
  // Manual fields
  httpProxy?: string
  httpPort?: number
  useHttpForHttps?: boolean
  httpsProxy?: string
  httpsPort?: number
  socksHost?: string
  socksPort?: number
  socksVersion?: 4 | 5
  proxyDnsViaSocks?: boolean
  // PAC field
  pacUrl?: string
  // Shared
  noProxy?: string
}

export interface AppSettings {
  whisperModel: string
  whisperLanguage: string
  hfEndpoint?: string
  proxy?: ProxySettings
  llm: {
    baseURL: string
    model: string
    apiVersion?: string
  }
}

export type RecordingStatus =
  | { state: 'idle' }
  | { state: 'recording'; sessionId: string; startedAt: number }
  | { state: 'stopping' }
  | { state: 'saving' }
