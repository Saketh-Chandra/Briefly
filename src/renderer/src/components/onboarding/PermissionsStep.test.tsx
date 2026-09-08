import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import PermissionsStep from './PermissionsStep'

vi.mock('@/lib/api', () => ({
  api: {
    requestMicPermission: vi.fn(),
    openScreenRecordingSettings: vi.fn()
  }
}))

import { api } from '@/lib/api'

const base = { stepNumber: 4, totalSteps: 5, onRefresh: vi.fn().mockResolvedValue(undefined) }

describe('PermissionsStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.requestMicPermission).mockResolvedValue(true)
    vi.mocked(api.openScreenRecordingSettings).mockResolvedValue(undefined)
  })

  it('renders the step heading', () => {
    render(<PermissionsStep {...base} permissions={{ screen: 'unknown', mic: 'unknown' }} />)
    expect(screen.getByText(/step 4 of 5/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /grant permissions/i })).toBeInTheDocument()
  })

  it('shows granted state when both permissions are allowed', () => {
    render(<PermissionsStep {...base} permissions={{ screen: 'granted', mic: 'granted' }} />)
    expect(screen.getAllByText(/^granted$/i)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /open settings/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^grant$/i })).not.toBeInTheDocument()
  })

  it('opens Screen Recording settings when not granted', async () => {
    render(<PermissionsStep {...base} permissions={{ screen: 'denied', mic: 'granted' }} />)
    expect(screen.getByText(/^denied$/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    await waitFor(() => expect(api.openScreenRecordingSettings).toHaveBeenCalledOnce())
  })

  it('requests microphone permission and refreshes', async () => {
    render(<PermissionsStep {...base} permissions={{ screen: 'granted', mic: 'unknown' }} />)
    expect(screen.getByText(/not granted/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^grant$/i }))
    await waitFor(() => expect(api.requestMicPermission).toHaveBeenCalledOnce())
    expect(base.onRefresh).toHaveBeenCalledOnce()
  })
})
