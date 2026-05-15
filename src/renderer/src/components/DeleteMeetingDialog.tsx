import React from 'react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

interface DeleteMeetingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
}

export default function DeleteMeetingDialog({
  open,
  onOpenChange,
  onConfirm
}: DeleteMeetingDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete recording?</DialogTitle>
          <DialogDescription>
            This will permanently delete the audio file, transcript, summary, and all associated
            data. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void onConfirm()}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
