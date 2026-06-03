import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStore } from 'jotai'

vi.mock('@/lib/api', () => ({
  api: {
    getMeetings: vi.fn(),
    getMeetingsByDate: vi.fn(),
    searchMeetings: vi.fn()
  }
}))

import { api } from '@/lib/api'
import {
  meetingsAtom,
  liveMeetingsAtom,
  loadMeetingsAtom,
  filteredMeetingsAtom,
  runSearchAtom,
  searchTermAtom,
  searchResultsAtom,
  isSearchingAtom,
  statusFilterAtom
} from './pages'
import { transcriptionAtom, initialTranscriptionState } from './transcription'
import type { Meeting } from '../../../main/lib/types'

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 1,
    session_id: 'sess-1',
    title: 'Sprint Standup',
    date: new Date().toISOString(),
    duration_s: 120,
    audio_path: '/tmp/audio.webm',
    status: 'done',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// liveMeetingsAtom — idle pipeline
// ---------------------------------------------------------------------------

describe('liveMeetingsAtom — idle pipeline', () => {
  it('returns meetings unchanged when pipeline is idle', () => {
    const store = createStore()
    const m = makeMeeting()
    store.set(meetingsAtom, [m])
    expect(store.get(liveMeetingsAtom)).toEqual([m])
  })

  it('returns empty list when no meetings are loaded', () => {
    const store = createStore()
    store.set(meetingsAtom, [])
    expect(store.get(liveMeetingsAtom)).toEqual([])
  })

  it('does not overlay when stage is done', () => {
    const store = createStore()
    const m = makeMeeting({ id: 3, status: 'done' })
    store.set(meetingsAtom, [m])
    store.set(transcriptionAtom, { ...initialTranscriptionState, meetingId: 3, stage: 'done' })
    expect(store.get(liveMeetingsAtom)[0].status).toBe('done')
  })
})

// ---------------------------------------------------------------------------
// liveMeetingsAtom — active pipeline overlay
// ---------------------------------------------------------------------------

describe('liveMeetingsAtom — active pipeline overlay', () => {
  it('overlays transcribing status for the active meeting', () => {
    const store = createStore()
    const m = makeMeeting({ id: 42, status: 'recorded' })
    store.set(meetingsAtom, [m])
    store.set(transcriptionAtom, {
      ...initialTranscriptionState,
      meetingId: 42,
      stage: 'transcribing'
    })
    expect(store.get(liveMeetingsAtom)[0].status).toBe('transcribing')
  })

  it('overlays processing status when stage is processing-llm', () => {
    const store = createStore()
    const m = makeMeeting({ id: 7, status: 'transcribed' })
    store.set(meetingsAtom, [m])
    store.set(transcriptionAtom, {
      ...initialTranscriptionState,
      meetingId: 7,
      stage: 'processing-llm'
    })
    expect(store.get(liveMeetingsAtom)[0].status).toBe('processing')
  })

  it('overlays error status when stage is error', () => {
    const store = createStore()
    const m = makeMeeting({ id: 5, status: 'transcribing' })
    store.set(meetingsAtom, [m])
    store.set(transcriptionAtom, {
      ...initialTranscriptionState,
      meetingId: 5,
      stage: 'error'
    })
    expect(store.get(liveMeetingsAtom)[0].status).toBe('error')
  })

  it('does not overlay unrelated meetings', () => {
    const store = createStore()
    const m1 = makeMeeting({ id: 1, status: 'done' })
    const m2 = makeMeeting({ id: 2, status: 'recorded' })
    store.set(meetingsAtom, [m1, m2])
    store.set(transcriptionAtom, {
      ...initialTranscriptionState,
      meetingId: 2,
      stage: 'transcribing'
    })
    const result = store.get(liveMeetingsAtom)
    expect(result[0].status).toBe('done')
    expect(result[1].status).toBe('transcribing')
  })
})

// ---------------------------------------------------------------------------
// loadMeetingsAtom
// ---------------------------------------------------------------------------

describe('loadMeetingsAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches meetings and populates meetingsAtom', async () => {
    const meetings = [makeMeeting({ id: 10 }), makeMeeting({ id: 11 })]
    vi.mocked(api.getMeetings).mockResolvedValue(meetings)
    const store = createStore()
    await store.set(loadMeetingsAtom, undefined)
    expect(store.get(meetingsAtom)).toEqual(meetings)
  })

  it('sets meetingsAtom to empty array when no meetings exist', async () => {
    vi.mocked(api.getMeetings).mockResolvedValue([])
    const store = createStore()
    store.set(meetingsAtom, [makeMeeting()])
    await store.set(loadMeetingsAtom, undefined)
    expect(store.get(meetingsAtom)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// runSearchAtom
// ---------------------------------------------------------------------------

describe('runSearchAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears results for empty query', async () => {
    vi.mocked(api.searchMeetings).mockResolvedValue([])
    const store = createStore()
    store.set(searchResultsAtom, [makeMeeting()])
    await store.set(runSearchAtom, '')
    expect(store.get(searchResultsAtom)).toBeNull()
    expect(store.get(isSearchingAtom)).toBe(false)
  })

  it('clears results for whitespace-only query', async () => {
    const store = createStore()
    store.set(searchResultsAtom, [makeMeeting()])
    await store.set(runSearchAtom, '   ')
    expect(store.get(searchResultsAtom)).toBeNull()
  })

  it('sets isSearching to true while search is in flight', async () => {
    let resolveFn!: (v: Meeting[]) => void
    vi.mocked(api.searchMeetings).mockReturnValue(
      new Promise<Meeting[]>((resolve) => {
        resolveFn = resolve
      })
    )
    const store = createStore()
    const promise = store.set(runSearchAtom, 'standup')
    expect(store.get(isSearchingAtom)).toBe(true)
    resolveFn([])
    await promise
    expect(store.get(isSearchingAtom)).toBe(false)
  })

  it('stores search results after completion', async () => {
    const results = [makeMeeting({ id: 99, title: 'Standup Review' })]
    vi.mocked(api.searchMeetings).mockResolvedValue(results)
    const store = createStore()
    await store.set(runSearchAtom, 'standup')
    expect(store.get(searchResultsAtom)).toEqual(results)
    expect(api.searchMeetings).toHaveBeenCalledWith('standup')
  })

  it('sets searchTermAtom to the query string', async () => {
    vi.mocked(api.searchMeetings).mockResolvedValue([])
    const store = createStore()
    await store.set(runSearchAtom, 'planning')
    expect(store.get(searchTermAtom)).toBe('planning')
  })
})

// ---------------------------------------------------------------------------
// filteredMeetingsAtom
// ---------------------------------------------------------------------------

describe('filteredMeetingsAtom', () => {
  it('returns all meetings when no filter and no search', () => {
    const store = createStore()
    const meetings = [makeMeeting({ id: 1 }), makeMeeting({ id: 2 })]
    store.set(meetingsAtom, meetings)
    expect(store.get(filteredMeetingsAtom)).toHaveLength(2)
  })

  it('filters by status when statusFilterAtom is set', () => {
    const store = createStore()
    store.set(meetingsAtom, [
      makeMeeting({ id: 1, status: 'done' }),
      makeMeeting({ id: 2, status: 'recorded' }),
      makeMeeting({ id: 3, status: 'done' })
    ])
    store.set(statusFilterAtom, 'done')
    const result = store.get(filteredMeetingsAtom)
    expect(result).toHaveLength(2)
    expect(result.every((m) => m.status === 'done')).toBe(true)
  })

  it('uses FTS results when search has returned', () => {
    const store = createStore()
    const all = [makeMeeting({ id: 1 }), makeMeeting({ id: 2 })]
    const fts = [makeMeeting({ id: 2 })]
    store.set(meetingsAtom, all)
    store.set(searchTermAtom, 'query')
    store.set(searchResultsAtom, fts)
    const result = store.get(filteredMeetingsAtom)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  it('falls back to title-only filter while search is in flight', () => {
    const store = createStore()
    store.set(meetingsAtom, [
      makeMeeting({ id: 1, title: 'Sprint Review' }),
      makeMeeting({ id: 2, title: 'Other Meeting' })
    ])
    store.set(searchTermAtom, 'sprint')
    store.set(searchResultsAtom, null)
    const result = store.get(filteredMeetingsAtom)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('applies status filter on top of FTS results', () => {
    const store = createStore()
    const fts = [makeMeeting({ id: 1, status: 'done' }), makeMeeting({ id: 2, status: 'recorded' })]
    store.set(meetingsAtom, fts)
    store.set(searchTermAtom, 'query')
    store.set(searchResultsAtom, fts)
    store.set(statusFilterAtom, 'done')
    const result = store.get(filteredMeetingsAtom)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })
})
