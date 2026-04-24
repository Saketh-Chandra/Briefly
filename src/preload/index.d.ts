import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  CaptureSource,
  Meeting,
  MeetingDetail,
  AppSettings,
  CaptureEvent,
  TranscriptChunk,
  Todo
} from '../main/lib/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // Capture
      getSources: () => Promise<CaptureSource[]>
      checkPermissions: () => Promise<{ screen: string; mic: string }>
      requestMicPermission: () => Promise<boolean>
      startRecording: (opts: {
        mixMic: boolean
        sourceId: string | null
      }) => Promise<{ sessionId: string; meetingId: number; audioPath: string }>
      writeAudioChunk: (sessionId: string, chunk: ArrayBuffer) => Promise<void>
      finalizeRecording: (sessionId: string, durationS: number) => Promise<void>
      takeScreenshot: () => Promise<string | null>
      onCaptureEvent: (cb: (event: CaptureEvent) => void) => () => void

      // Storage
      getMeetings: () => Promise<Meeting[]>
      getMeeting: (id: number) => Promise<MeetingDetail | null>
      deleteMeeting: (id: number) => Promise<void>

      // Settings
      getSettings: () => Promise<AppSettings & { llm: AppSettings['llm'] & { hasApiKey: boolean } }>
      saveSettings: (partial: Partial<AppSettings> & { llmApiKey?: string }) => Promise<void>

      // Transcription
      getPaths: () => Promise<{ userData: string; modelCachePath: string }>
      startTranscription: (meetingId: number) => Promise<{ audioPath: string }>
      saveTranscript: (params: {
        meetingId: number
        content: string
        chunks: TranscriptChunk[]
        model: string
      }) => Promise<void>
      getTranscript: (meetingId: number) => Promise<{
        content: string
        chunks: TranscriptChunk[] | null
        model: string | null
      } | null>

      // LLM Processing
      processTranscript: (meetingId: number) => Promise<{
        title: string
        summary: string
        todos: Todo[]
        journal: string
      }>
      onLlmProgress: (
        cb: (event: { meetingId: number; step: number; total: number; label: string }) => void
      ) => () => void
      onLlmDone: (cb: (event: { meetingId: number }) => void) => () => void
      onTranscriptionStatus: (
        cb: (event: { meetingId: number; status: string; error?: string }) => void
      ) => () => void
      getMeetingsByDate: (date: string) => Promise<Meeting[]>
      getModelStatus: (modelId: string) => Promise<{ present: boolean; sizeBytes: number }>
      deleteModel: (modelId: string) => Promise<void>
      getDiskUsage: () => Promise<{ audioBytes: number; userData: string }>
      revealInFinder: () => Promise<void>
      clearAllRecordings: () => Promise<void>
      testLlmConnection: () => Promise<{ ok: boolean }>
      testMirror: (endpoint: string) => Promise<{ ok: boolean; error?: string }>
      readAudio: (audioPath: string) => Promise<ArrayBuffer>
      readScreenshot: (screenshotPath: string) => Promise<string>
      writeImageToClipboard: (dataUrl: string) => Promise<void>
      updateTodo: (meetingId: number, index: number, done: boolean) => Promise<void>
      updateJournal: (meetingId: number, journal: string) => Promise<void>
      resetForReprocessing: (meetingId: number) => Promise<void>
      onToggleRecordingShortcut: (cb: () => void) => () => void
      onTrayCommand: (cb: (command: 'start' | 'stop' | 'screenshot') => void) => () => void
      onNavigate: (cb: (path: string) => void) => () => void
      showNotification: (title: string, body: string) => void
      getOsInfo: () => Promise<{ darwinVersion: string }>
      openScreenRecordingSettings: () => Promise<void>
    }
  }
}
