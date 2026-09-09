import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReadyStep from './ReadyStep'

const ready = {
  stepNumber: 5,
  totalSteps: 5,
  llmConfigured: true,
  whisperReady: true,
  screenPermission: 'granted',
  micPermission: 'granted'
}

describe('ReadyStep', () => {
  it('renders the step heading', () => {
    render(<ReadyStep {...ready} />)
    expect(screen.getByText(/step 5 of 5/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /you.re ready/i })).toBeInTheDocument()
  })

  it('shows configured and granted rows when everything is set', () => {
    render(<ReadyStep {...ready} />)
    expect(screen.getByText('Configured')).toBeInTheDocument()
    expect(screen.getByText('Downloaded')).toBeInTheDocument()
    expect(screen.getAllByText('Granted')).toHaveLength(2)
  })

  it('shows skip and warning details when items were skipped', () => {
    render(
      <ReadyStep
        {...ready}
        llmConfigured={false}
        whisperReady={false}
        screenPermission="denied"
        micPermission="unknown"
      />
    )
    expect(screen.getByText(/skipped — add in settings/i)).toBeInTheDocument()
    expect(screen.getByText(/downloads automatically on first use/i)).toBeInTheDocument()
    expect(screen.getByText(/not granted — required for system audio/i)).toBeInTheDocument()
    expect(screen.getByText(/not granted — optional/i)).toBeInTheDocument()
  })
})
