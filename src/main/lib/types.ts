// Window info returned by list-windows mode
export interface WindowInfo {
  id: number
  title: string
  app: string
}

// NDJSON events emitted by the Swift CLI → Node
export type CliEvent =
  | { type: 'ready' }
  | { type: 'status'; state: 'recording' | 'stopping' }
  | { type: 'level'; rms: number }
  | { type: 'screenshot_done'; path: string }
  | { type: 'stopped'; duration_s: number; path: string }
  | { type: 'error'; message: string }

// NDJSON commands sent from Node → Swift CLI
export type CliCommand =
  | { cmd: 'start_recording'; output: string; mix_mic: boolean }
  | { cmd: 'stop_recording' }
  | { cmd: 'take_screenshot'; output: string }

// Meeting row (from DB)
export interface Meeting {
  id: number
  session_id: string
  title: string | null
  date: string          // ISO 8601
  duration_s: number | null
  audio_path: string
  status: MeetingStatus
  created_at: string
  updated_at: string
}

export type MeetingStatus =
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
