import React, { useEffect } from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import SearchBar from '../components/SearchBar'
import FilterBar from '../components/FilterBar'
import MeetingList from '../components/MeetingList'
import DeleteMeetingDialog from '../components/DeleteMeetingDialog'
import {
  loadMeetingsAtom,
  runSearchAtom,
  statusFilterAtom,
  filteredMeetingsAtom,
  searchResultsAtom,
  searchTermAtom,
  isSearchingAtom
} from '../atoms/pages'
import { api } from '../lib/api'
import { useDeleteMeeting } from '../hooks/useDeleteMeeting'

export default function Recordings(): React.JSX.Element {
  const loadMeetings = useSetAtom(loadMeetingsAtom)
  const filtered = useAtomValue(filteredMeetingsAtom)
  const runSearch = useSetAtom(runSearchAtom)
  const setSearchResults = useSetAtom(searchResultsAtom)
  const [statusFilter, setStatusFilter] = useAtom(statusFilterAtom)
  const searchTerm = useAtomValue(searchTermAtom)
  const isSearching = useAtomValue(isSearchingAtom)
  const searchResults = useAtomValue(searchResultsAtom)
  const { deleteId, setDeleteId, handleDelete, confirmDelete } = useDeleteMeeting(
    () => void loadMeetings()
  )

  useEffect(() => {
    void loadMeetings()
    // Clear stale search results when the meetings list reloads
    setSearchResults(null)
  }, [loadMeetings, setSearchResults])

  // Reload when a recording saves
  useEffect(() => {
    const unsub = api.onCaptureEvent((event) => {
      if (event.type === 'stopped') void loadMeetings()
    })
    return unsub
  }, [loadMeetings])

  // Reload when transcription or LLM finishes so status badges update
  useEffect(() => {
    const unsub = api.onTranscriptionStatus(() => void loadMeetings())
    return unsub
  }, [loadMeetings])

  useEffect(() => {
    const unsub = api.onLlmDone(() => void loadMeetings())
    return unsub
  }, [loadMeetings])

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 font-display text-2xl italic text-foreground/80">Recordings</h1>

      <div className="mb-5 flex flex-col gap-3">
        <SearchBar onSearch={(q) => void runSearch(q)} />
        <FilterBar active={statusFilter} onChange={setStatusFilter} />
      </div>

      {searchTerm && (
        <p className="mb-3 text-[11px] text-muted-foreground/60">
          {searchResults !== null
            ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${searchTerm}"${isSearching ? '…' : ''}`
            : isSearching
              ? 'Searching…'
              : null}
        </p>
      )}

      <MeetingList
        meetings={filtered}
        onDelete={handleDelete}
        flat={!!searchTerm}
        emptyMessage={searchTerm ? `No results for "${searchTerm}"` : 'No recordings yet.'}
      />

      <DeleteMeetingDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
