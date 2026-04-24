import React, { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import { useRecording } from '../../contexts/RecordingContext'

export default function AppShell(): React.JSX.Element {
  const { toggleRecording, startRecording, stopRecording, state } = useRecording()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)

  // Redirect to onboarding if first run
  useEffect(() => {
    window.api
      .getSettings()
      .then((s) => {
        if (!s.onboardingComplete) {
          navigate('/onboarding', { replace: true })
        } else {
          setReady(true)
        }
      })
      .catch(() => setReady(true)) // on error, show the app
  }, [navigate])

  useEffect(() => {
    return window.api.onToggleRecordingShortcut(() => void toggleRecording())
  }, [toggleRecording])

  // macOS tray commands — same code paths as UI buttons, React owns all state
  useEffect(() => {
    return window.api.onTrayCommand((command) => {
      if (command === 'start') {
        if (state.status === 'idle') void startRecording(true)
      } else if (command === 'stop') {
        if (state.status === 'recording') void stopRecording()
      } else if (command === 'screenshot') {
        void window.api.takeScreenshot()
      }
    })
  }, [startRecording, stopRecording, state.status])

  // Navigate to the correct page when a system notification is clicked
  useEffect(() => {
    return window.api.onNavigate((path) => navigate(path))
  }, [navigate])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {ready && (
        <>
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TitleBar />
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
          </div>
        </>
      )}
    </div>
  )
}
