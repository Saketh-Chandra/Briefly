import { useState } from 'react'

/**
 * Shared delete-meeting state and handlers for pages that show a meeting list.
 * Exposes `deleteId`, `setDeleteId`, `handleDelete`, and `confirmDelete` for
 * use with `<DeleteMeetingDialog>`.
 */
export function useDeleteMeeting(onDeleted: () => void): {
  deleteId: number | null
  setDeleteId: React.Dispatch<React.SetStateAction<number | null>>
  handleDelete: (id: number) => void
  confirmDelete: () => Promise<void>
} {
  const [deleteId, setDeleteId] = useState<number | null>(null)

  function handleDelete(id: number): void {
    setDeleteId(id)
  }

  async function confirmDelete(): Promise<void> {
    if (deleteId === null) return
    await window.api.deleteMeeting(deleteId)
    setDeleteId(null)
    onDeleted()
  }

  return { deleteId, setDeleteId, handleDelete, confirmDelete }
}
