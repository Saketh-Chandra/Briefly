import React, { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import { useRecording } from '../../contexts/RecordingContext'

export default function AppShell(): React.JSX.Element {
  const { toggleRecording } = useRecording()
  const navigate = useNavigate()

  useEffect(() => {
    return window.api.onToggleRecordingShortcut(() => void toggleRecording())
  }, [toggleRecording])

  // Navigate to the correct page when a system notification is clicked
  useEffect(() => {
    return window.api.onNavigate((path) => navigate(path))
  }, [navigate])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TitleBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
