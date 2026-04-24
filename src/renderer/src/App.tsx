import React from 'react'
import { Provider } from 'jotai'
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { RecordingProvider } from './contexts/RecordingContext'
import { TranscriptionProvider } from './contexts/TranscriptionContext'
import AppShell from './components/layout/AppShell'
import Dashboard from './pages/Dashboard'
import Recordings from './pages/Recordings'
import Transcript from './pages/Transcript'
import Journal from './pages/Journal'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'

const router = createHashRouter([
  {
    path: '/onboarding',
    element: <Onboarding />
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'recordings', element: <Recordings /> },
      { path: 'recordings/:id', element: <Transcript /> },
      { path: 'journal', element: <Journal /> },
      { path: 'journal/:date', element: <Journal /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
])

export default function App(): React.JSX.Element {
  return (
    <Provider>
      <RecordingProvider>
        <TranscriptionProvider>
          <RouterProvider router={router} />
        </TranscriptionProvider>
      </RecordingProvider>
    </Provider>
  )
}
