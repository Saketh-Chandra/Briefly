import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WelcomeStep from './WelcomeStep'

describe('WelcomeStep', () => {
  it('renders the brand heading and tagline', () => {
    render(<WelcomeStep isSupportedOS={true} />)
    expect(screen.getByRole('heading', { name: /briefly/i })).toBeInTheDocument()
    expect(screen.getByText(/your meetings, summarised privately/i)).toBeInTheDocument()
  })

  it('hides the OS warning while the version is still loading', () => {
    render(<WelcomeStep isSupportedOS={null} />)
    expect(screen.queryByText(/system audio capture requires/i)).not.toBeInTheDocument()
  })

  it('hides the OS warning on a supported version', () => {
    render(<WelcomeStep isSupportedOS={true} />)
    expect(screen.queryByText(/system audio capture requires/i)).not.toBeInTheDocument()
  })

  it('shows the OS warning when system audio is unsupported', () => {
    render(<WelcomeStep isSupportedOS={false} />)
    expect(screen.getByText(/system audio capture requires macOS 14\.2/i)).toBeInTheDocument()
  })
})
