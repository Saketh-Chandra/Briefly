import { atom } from 'jotai'
import type { Meeting, MeetingStatus } from '../../../main/lib/types'
import { transcriptionAtom } from './transcription'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Shared meetings list ──────────────────────────────────────────────────────

/** All meetings fetched from the database — shared between Dashboard and Recordings. */
export const meetingsAtom = atom<Meeting[]>([])

/** Fetch all meetings from the database and populate meetingsAtom. */
export const loadMeetingsAtom = atom(null, async (_get, set): Promise<void> => {
  const all = await window.api.getMeetings()
  set(meetingsAtom, all)
})

/**
 * Meetings with the live pipeline status overlaid so that navigating to
 * Dashboard or Recordings always shows the correct in-flight state without
 * waiting for a DB round-trip.
 */
export const liveMeetingsAtom = atom((get) => {
  const list = get(meetingsAtom)
  const txState = get(transcriptionAtom)
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
})

// ── Recordings page filters ───────────────────────────────────────────────────

/** Full-text search term for the Recordings page. */
export const searchTermAtom = atom<string>('')

/** Status filter pill selection for the Recordings page. */
export const statusFilterAtom = atom<MeetingStatus | null>(null)

/** Meetings filtered by statusFilterAtom and searchTermAtom — derived, no async. */
export const filteredMeetingsAtom = atom((get) => {
  let result = get(liveMeetingsAtom)
  const statusFilter = get(statusFilterAtom)
  const searchTerm = get(searchTermAtom)
  if (statusFilter) result = result.filter((m) => m.status === statusFilter)
  if (searchTerm) {
    const lower = searchTerm.toLowerCase()
    result = result.filter((m) => (m.title ?? '').toLowerCase().includes(lower))
  }
  return result
})

// ── Journal page ──────────────────────────────────────────────────────────────

/** Currently selected journal date (ISO 8601). Defaults to today. */
export const journalDateAtom = atom<string>(todayISO())

/** Meetings loaded for the selected journal date. */
export const journalMeetingsAtom = atom<Meeting[]>([])

/** Fetch meetings for the given date and populate journalMeetingsAtom. */
export const loadJournalMeetingsAtom = atom(
  null,
  async (_get, set, date: string): Promise<void> => {
    const result = await window.api.getMeetingsByDate(date)
    set(journalMeetingsAtom, result)
  }
)
