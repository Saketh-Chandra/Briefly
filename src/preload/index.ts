import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  CaptureSource,
  Meeting,
  MeetingDetail,
  AppSettings,
  CaptureEvent,
  TranscriptChunk,
  Todo
} from '../main/lib/types'

// Must match CAPTURE_EVENT_CHANNEL in renderer/src/lib/capture-session.ts
const CAPTURE_EVENT_CHANNEL = 'briefly-capture-events'

const api = {
  // --- Capture ---

  getSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke('capture:get-sources'),

  checkPermissions: (): Promise<{ screen: string; mic: string }> =>
    ipcRenderer.invoke('capture:check-permissions'),

  requestMicPermission: (): Promise<boolean> =>
    ipcRenderer.invoke('capture:request-mic-permission'),

  startRecording: (opts: {
    mixMic: boolean
    sourceId: string | null
  }): Promise<{ sessionId: string; meetingId: number; audioPath: string }> =>
    ipcRenderer.invoke('capture:start', opts),

  writeAudioChunk: (sessionId: string, chunk: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('capture:write-chunk', sessionId, chunk),

  finalizeRecording: (sessionId: string, durationS: number): Promise<void> =>
    ipcRenderer.invoke('capture:finalize', sessionId, durationS),

  takeScreenshot: (): Promise<string | null> => ipcRenderer.invoke('capture:screenshot-save'),

  // Subscribe to real-time events from the renderer CaptureSession.
  // Events travel via BroadcastChannel (no round-trip through main process).
  // Returns an unsubscribe function — call it in useEffect cleanup.
  onCaptureEvent: (cb: (event: CaptureEvent) => void): (() => void) => {
    const bus = new BroadcastChannel(CAPTURE_EVENT_CHANNEL)
    const handler = (e: MessageEvent<CaptureEvent>) => cb(e.data)
    bus.addEventListener('message', handler)
    return () => {
      bus.removeEventListener('message', handler)
      bus.close()
    }
  },

  // --- Storage ---

  getMeetings: (): Promise<Meeting[]> => ipcRenderer.invoke('storage:get-meetings'),

  getMeeting: (id: number): Promise<MeetingDetail | null> =>
    ipcRenderer.invoke('storage:get-meeting', id),

  deleteMeeting: (id: number): Promise<void> => ipcRenderer.invoke('storage:delete-meeting', id),

  // --- Settings ---

  // Returns settings + llm.hasApiKey boolean (never the raw key)
  getSettings: (): Promise<AppSettings & { llm: AppSettings['llm'] & { hasApiKey: boolean } }> =>
    ipcRenderer.invoke('settings:get'),

  // Pass llmApiKey to save to macOS Keychain; other fields go to settings.json
  saveSettings: (partial: Partial<AppSettings> & { llmApiKey?: string }): Promise<void> =>
    ipcRenderer.invoke('settings:save', partial),

  // --- Transcription ---

  // Returns paths the renderer needs: userData dir and model cache dir.
  getPaths: (): Promise<{ userData: string; modelCachePath: string }> =>
    ipcRenderer.invoke('transcription:get-paths'),

  // Kick off transcription for a meeting that has status='recorded'.
  // Resolves with the validated audio path once the main process has accepted the handoff.
  startTranscription: (meetingId: number): Promise<{ audioPath: string }> =>
    ipcRenderer.invoke('transcription:start', meetingId),

  // Called by the renderer worker once Whisper finishes.
  // saves transcript text + chunks to DB; main updates status to 'transcribed'.
  saveTranscript: (params: {
    meetingId: number
    content: string
    chunks: TranscriptChunk[]
    model: string
  }): Promise<void> => ipcRenderer.invoke('storage:save-transcript', params),

  // Fetch the saved transcript for a meeting.
  getTranscript: (
    meetingId: number
  ): Promise<{
    content: string
    chunks: TranscriptChunk[] | null
    model: string | null
  } | null> => ipcRenderer.invoke('storage:get-transcript', meetingId),

  // --- LLM Processing ---

  // Process a transcribed meeting: runs summary, todos, and journal LLM calls.
  // Resolves with the generated results when all three calls are done.
  processTranscript: (
    meetingId: number
  ): Promise<{
    title: string
    summary: string
    todos: Todo[]
    journal: string
  }> => ipcRenderer.invoke('llm:process', meetingId),

  // Subscribe to incremental LLM progress events.
  // { meetingId, step: 1|2|3, total: 3, label: string }
  onLlmProgress: (
    cb: (event: { meetingId: number; step: number; total: number; label: string }) => void
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      event: { meetingId: number; step: number; total: number; label: string }
    ) => cb(event)
    ipcRenderer.on('llm:progress', handler)
    return () => ipcRenderer.removeListener('llm:progress', handler)
  },

  // Fires when LLM processing for a meeting finishes successfully.
  onLlmDone: (cb: (event: { meetingId: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: { meetingId: number }) => cb(event)
    ipcRenderer.on('llm:done', handler)
    return () => ipcRenderer.removeListener('llm:done', handler)
  },

  // Subscribe to transcription status updates pushed from main (status, error).
  onTranscriptionStatus: (
    cb: (event: { meetingId: number; status: string; error?: string }) => void
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      event: { meetingId: number; status: string; error?: string }
    ) => cb(event)
    ipcRenderer.on('transcription:status', handler)
    return () => ipcRenderer.removeListener('transcription:status', handler)
  },

  getMeetingsByDate: (date: string): Promise<import('../main/lib/types').Meeting[]> =>
    ipcRenderer.invoke('storage:get-meetings-by-date', date),

  getModelStatus: (modelId: string): Promise<{ present: boolean; sizeBytes: number }> =>
    ipcRenderer.invoke('transcription:model-status', modelId),

  deleteModel: (modelId: string): Promise<void> =>
    ipcRenderer.invoke('transcription:delete-model', modelId),

  getDiskUsage: (): Promise<{ audioBytes: number; userData: string }> =>
    ipcRenderer.invoke('storage:get-disk-usage'),

  revealInFinder: (): Promise<void> => ipcRenderer.invoke('storage:reveal-in-finder'),

  clearAllRecordings: (): Promise<void> => ipcRenderer.invoke('storage:clear-all'),

  testLlmConnection: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('llm:test-connection'),

  testMirror: (endpoint: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('hf:test-mirror', endpoint),

  readAudio: (audioPath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('storage:read-audio', audioPath),

  updateTodo: (meetingId: number, index: number, done: boolean): Promise<void> =>
    ipcRenderer.invoke('storage:update-todo', meetingId, index, done),

  updateJournal: (meetingId: number, journal: string): Promise<void> =>
    ipcRenderer.invoke('storage:update-journal', meetingId, journal),

  resetForReprocessing: (meetingId: number): Promise<void> =>
    ipcRenderer.invoke('storage:reset-for-reprocessing', meetingId),

  // Fired when the user presses ⌘⇧R (registered as globalShortcut in main)
  onToggleRecordingShortcut: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('shortcut:toggle-recording', handler)
    return () => ipcRenderer.removeListener('shortcut:toggle-recording', handler)
  },

  // Fired when the user chooses a command from the macOS menu bar tray.
  // command: 'start' | 'stop' | 'screenshot'
  onTrayCommand: (cb: (command: 'start' | 'stop' | 'screenshot') => void): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      command: 'start' | 'stop' | 'screenshot'
    ): void => cb(command)
    ipcRenderer.on('tray:command', handler)
    return () => ipcRenderer.removeListener('tray:command', handler)
  },

  // Fired when the user clicks a system notification — navigate to the given route.
  onNavigate: (cb: (path: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, path: string) => cb(path)
    ipcRenderer.on('navigate', handler)
    return () => ipcRenderer.removeListener('navigate', handler)
  },

  // Trigger a main-process system notification from the renderer.
  showNotification: (title: string, body: string): void => {
    ipcRenderer.send('notify:show', title, body)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
