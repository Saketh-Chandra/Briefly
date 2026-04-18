import React, { useEffect } from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import SearchBar from '../components/SearchBar'
import FilterBar from '../components/FilterBar'
import MeetingList from '../components/MeetingList'
import {
  loadMeetingsAtom,
  searchTermAtom,
  statusFilterAtom,
  filteredMeetingsAtom
} from '../atoms/pages'

export default function Recordings(): React.JSX.Element {
  const loadMeetings = useSetAtom(loadMeetingsAtom)
  const filtered = useAtomValue(filteredMeetingsAtom)
  const setSearchTerm = useSetAtom(searchTermAtom)
  const [statusFilter, setStatusFilter] = useAtom(statusFilterAtom)

  useEffect(() => {
    void loadMeetings()
  }, [loadMeetings])

  // Reload when a recording saves
  useEffect(() => {
    const unsub = window.api.onCaptureEvent((event) => {
      if (event.type === 'stopped') void loadMeetings()
    })
    return unsub
  }, [loadMeetings])

  // Reload when transcription or LLM finishes so status badges update
  useEffect(() => {
    const unsub = window.api.onTranscriptionStatus(() => void loadMeetings())
    return unsub
  }, [loadMeetings])

  useEffect(() => {
    const unsub = window.api.onLlmDone(() => void loadMeetings())
    return unsub
  }, [loadMeetings])

  async function handleDelete(id: number): Promise<void> {
    if (!window.confirm('Delete this recording?')) return
    await window.api.deleteMeeting(id)
    void loadMeetings()
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 font-display text-2xl italic text-foreground/80">Recordings</h1>

      <div className="mb-5 flex flex-col gap-3">
        <SearchBar onSearch={setSearchTerm} />
        <FilterBar active={statusFilter} onChange={setStatusFilter} />
      </div>

      <MeetingList meetings={filtered} onDelete={handleDelete} />
    </div>
  )
}
