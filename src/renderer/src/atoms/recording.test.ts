import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStore } from 'jotai'

const { mockStart, mockStop } = vi.hoisted(() => ({
  mockStart: vi.fn().mockResolvedValue(undefined),
  mockStop: vi.fn()
}))

vi.mock('../lib/capture-session', () => ({
  CaptureSession: vi.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop
  }))
}))

vi.mock('@/lib/api', () => ({
  api: {
    startRecording: vi.fn()
  }
}))

import { api } from '@/lib/api'
import { CaptureSession } from '../lib/capture-session'
import {
  recordingAtom,
  recordingStatusAtom,
  selectedSourceIdAtom,
  startRecordingAtom,
  stopRecordingAtom,
  toggleRecordingAtom,
  initialRecordingState,
  disposeActiveSession
} from './recording'

describe('recordingAtom — derived status', () => {
  it('exposes status through recordingStatusAtom', () => {
    const store = createStore()
    expect(store.get(recordingStatusAtom)).toBe('idle')
    store.set(recordingAtom, { ...initialRecordingState, status: 'recording', meetingId: 1 })
    expect(store.get(recordingStatusAtom)).toBe('recording')
  })
})

describe('startRecordingAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStart.mockResolvedValue(undefined)
    disposeActiveSession()
  })

  it('starts a session from idle and stores the meeting id', async () => {
    vi.mocked(api.startRecording).mockResolvedValue({
      sessionId: 'sess-1',
      meetingId: 42,
      audioPath: '/tmp/audio.webm'
    })
    const store = createStore()
    store.set(selectedSourceIdAtom, 'screen:1')
    const result = await store.set(startRecordingAtom, true)
    expect(result).toEqual({ meetingId: 42 })
    expect(api.startRecording).toHaveBeenCalledWith({ mixMic: true, sourceId: 'screen:1' })
    expect(CaptureSession).toHaveBeenCalledWith('sess-1', { mixMic: true })
    expect(mockStart).toHaveBeenCalledOnce()
    expect(store.get(recordingAtom)).toMatchObject({
      status: 'recording',
      sessionId: 'sess-1',
      meetingId: 42
    })
  })

  it('does not start a second session while already recording', async () => {
    const store = createStore()
    store.set(recordingAtom, {
      ...initialRecordingState,
      status: 'recording',
      meetingId: 7
    })
    const result = await store.set(startRecordingAtom, false)
    expect(result).toEqual({ meetingId: 7 })
    expect(api.startRecording).not.toHaveBeenCalled()
  })

  it('resets to idle when startRecording fails', async () => {
    vi.mocked(api.startRecording).mockRejectedValue(new Error('permission denied'))
    const store = createStore()
    await expect(store.set(startRecordingAtom, false)).rejects.toThrow('permission denied')
    expect(store.get(recordingAtom)).toEqual(initialRecordingState)
  })

  it('resets to idle when CaptureSession.start fails', async () => {
    vi.mocked(api.startRecording).mockResolvedValue({
      sessionId: 'sess-2',
      meetingId: 9,
      audioPath: '/tmp/audio.webm'
    })
    mockStart.mockRejectedValueOnce(new Error('getDisplayMedia failed'))
    const store = createStore()
    await expect(store.set(startRecordingAtom, true)).rejects.toThrow('getDisplayMedia failed')
    expect(store.get(recordingAtom)).toEqual(initialRecordingState)
  })
})

describe('stopRecordingAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    disposeActiveSession()
  })

  it('is a no-op when status is not recording', async () => {
    const store = createStore()
    await store.set(stopRecordingAtom)
    expect(mockStop).not.toHaveBeenCalled()
    expect(store.get(recordingAtom).status).toBe('idle')
  })

  it('sets stopping and stops the active session', async () => {
    vi.mocked(api.startRecording).mockResolvedValue({
      sessionId: 'sess-1',
      meetingId: 1,
      audioPath: '/tmp/audio.webm'
    })
    const store = createStore()
    await store.set(startRecordingAtom, false)
    await store.set(stopRecordingAtom)
    expect(store.get(recordingAtom).status).toBe('stopping')
    expect(mockStop).toHaveBeenCalledOnce()
  })
})

describe('toggleRecordingAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStart.mockResolvedValue(undefined)
    disposeActiveSession()
  })

  it('starts recording from idle with mixMic enabled', async () => {
    vi.mocked(api.startRecording).mockResolvedValue({
      sessionId: 'sess-1',
      meetingId: 3,
      audioPath: '/tmp/audio.webm'
    })
    const store = createStore()
    await store.set(toggleRecordingAtom)
    expect(api.startRecording).toHaveBeenCalledWith({ mixMic: true, sourceId: null })
    expect(store.get(recordingAtom).status).toBe('recording')
  })

  it('stops an active recording', async () => {
    vi.mocked(api.startRecording).mockResolvedValue({
      sessionId: 'sess-1',
      meetingId: 3,
      audioPath: '/tmp/audio.webm'
    })
    const store = createStore()
    await store.set(startRecordingAtom, true)
    await store.set(toggleRecordingAtom)
    expect(store.get(recordingAtom).status).toBe('stopping')
    expect(mockStop).toHaveBeenCalledOnce()
  })
})
