import { atom } from 'jotai'
import type { Meeting, MeetingStatus } from '../../../main/lib/types'
import { transcriptionAtom } from './transcription'
import type { TranscriptionState } from './transcription'
import { toLocalISODate } from '../lib/format'
import { api } from '../lib/api'

// ── Shared meetings list ──────────────────────────────────────────────────────

/** All meetings fetched from the database — shared between Dashboard and Recordings. */
export const meetingsAtom = atom<Meeting[]>([])

/** Fetch all meetings from the database and populate meetingsAtom. */
export const loadMeetingsAtom = atom(null, async (_get, set): Promise<void> => {
  const all = await api.getMeetings()
  set(meetingsAtom, all)
})

/** Overlay the active pipeline status onto a meeting list without a DB round-trip. */
function withLiveOverlay(list: Meeting[], txState: TranscriptionState): Meeting[] {
  if (txState.meetingId === null || txState.stage === 'idle' || txState.stage === 'done') {
    return list
  }
  const liveStatus: MeetingStatus =
    txState.stage === 'processing-llm'
      ? 'processing'
      : txState.stage === 'error'
        ? 'error'
        : 'transcribing'
  return list.map((m) => (m.id === txState.meetingId ? { ...m, status: liveStatus } : m))
}

/**
 * Meetings with the live pipeline status overlaid so that navigating to
 * Dashboard or Recordings always shows the correct in-flight state without
 * waiting for a DB round-trip.
 */
export const liveMeetingsAtom = atom((get) =>
  withLiveOverlay(get(meetingsAtom), get(transcriptionAtom))
)

// ── Recordings page filters ───────────────────────────────────────────────────

/** Full-text search term for the Recordings page. */
export const searchTermAtom = atom<string>('')

/** Status filter pill selection for the Recordings page. */
export const statusFilterAtom = atom<MeetingStatus | null>(null)

/**
 * Results from the FTS search IPC call. null means no search is active
 * (empty query or results not yet returned).
 */
export const searchResultsAtom = atom<Meeting[] | null>(null)

/** True while the FTS IPC call is in flight. */
export const isSearchingAtom = atom<boolean>(false)

/**
 * Async write atom: sets the search term, triggers the FTS IPC call,
 * and stores the results. Pass an empty string to clear the search.
 */
export const runSearchAtom = atom(null, async (_get, set, query: string): Promise<void> => {
  set(searchTermAtom, query)
  if (!query.trim()) {
    set(searchResultsAtom, null)
    set(isSearchingAtom, false)
    return
  }
  set(isSearchingAtom, true)
  const results = await api.searchMeetings(query)
  set(searchResultsAtom, results)
  set(isSearchingAtom, false)
})

/**
 * Meetings filtered by statusFilterAtom and searchTermAtom.
 * When a search is active and results have returned, uses FTS results
 * (with live pipeline status overlaid). Falls back to title-only filter
 * while the search IPC call is in flight.
 */
export const filteredMeetingsAtom = atom((get) => {
  const statusFilter = get(statusFilterAtom)
  const searchTerm = get(searchTermAtom)
  const searchResults = get(searchResultsAtom)
  const txState = get(transcriptionAtom)

  let result: Meeting[]
  if (searchTerm) {
    if (searchResults !== null) {
      // FTS results are back — use them with live overlay
      result = withLiveOverlay(searchResults, txState)
    } else {
      // Still loading — title-only fallback so the list isn't blank
      const lower = searchTerm.toLowerCase()
      result = withLiveOverlay(get(meetingsAtom), txState).filter((m) =>
        (m.title ?? '').toLowerCase().includes(lower)
      )
    }
  } else {
    result = get(liveMeetingsAtom)
  }

  if (statusFilter) result = result.filter((m) => m.status === statusFilter)
  return result
})

// ── Journal page ──────────────────────────────────────────────────────────────

/** Currently selected journal date (ISO 8601). Defaults to today. */
export const journalDateAtom = atom<string>(toLocalISODate(new Date()))

/** Meetings loaded for the selected journal date. */
export const journalMeetingsAtom = atom<Meeting[]>([])

/** Fetch meetings for the given date and populate journalMeetingsAtom. */
export const loadJournalMeetingsAtom = atom(
  null,
  async (_get, set, date: string): Promise<void> => {
    const result = await api.getMeetingsByDate(date)
    set(journalMeetingsAtom, result)
  }
)
