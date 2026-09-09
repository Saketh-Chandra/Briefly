import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Onboarding from './Onboarding'

// Wizard tests cover step wiring, not spring physics. Identity stubs skip Motion time.
vi.mock('motion/react', async () => {
  const React = await import('react')
  function passthrough(
    tag: string
  ): (props: {
    children?: React.ReactNode
    className?: string
    style?: React.CSSProperties
  }) => React.ReactElement {
    function MotionTag({
      children,
      className,
      style
    }: {
      children?: React.ReactNode
      className?: string
      style?: React.CSSProperties
    }): React.ReactElement {
      return React.createElement(tag, { className, style }, children)
    }
    return MotionTag
  }
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
    motion: new Proxy(
      {},
      {
        get: (_target, prop) => passthrough(String(prop))
      }
    )
  }
})

vi.mock('../components/onboarding/LlmSetupStep', () => ({
  default: () => <div>Connect your LLM</div>
}))
vi.mock('../components/onboarding/WhisperSetupStep', () => ({
  default: () => <div>Choose a Whisper model</div>
}))
vi.mock('../components/onboarding/PermissionsStep', () => ({
  default: () => <div>Grant permissions</div>
}))
vi.mock('../components/onboarding/ReadyStep', () => ({
  default: () => <div>You are ready</div>
}))

vi.mock('@/lib/api', () => ({
  api: {
    getOsInfo: vi.fn(),
    saveSettings: vi.fn(),
    checkPermissions: vi.fn()
  }
}))

import { api } from '@/lib/api'

async function renderOnboarding(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    )
  })
  return result
}

describe('Onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: '23.2.0' })
    vi.mocked(api.saveSettings).mockResolvedValue(undefined)
    vi.mocked(api.checkPermissions).mockResolvedValue({ screen: 'granted', mic: 'granted' })
  })

  it('renders the welcome step', async () => {
    await renderOnboarding()
    expect(screen.getByRole('heading', { name: /briefly/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument()
  })

  it('shows the unsupported OS warning on Darwin 22', async () => {
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: '22.0.0' })
    await renderOnboarding()
    await waitFor(() =>
      expect(screen.getByText(/system audio capture requires macOS 14\.2/i)).toBeInTheDocument()
    )
  })

  it('does not show the OS warning on Darwin 23.2+', async () => {
    await renderOnboarding()
    expect(screen.queryByText(/system audio capture requires/i)).not.toBeInTheDocument()
  })

  it('advances from welcome to the LLM step', async () => {
    await renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    expect(await screen.findByText(/connect your llm/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
  })

  it('skips the LLM step and continues to Whisper setup', async () => {
    await renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    await screen.findByText(/connect your llm/i)
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    expect(await screen.findByText(/choose a whisper model/i)).toBeInTheDocument()
  })

  it('completes onboarding and writes onboardingComplete', async () => {
    await renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    await screen.findByText(/connect your llm/i)
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    await screen.findByText(/choose a whisper model/i)
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    await screen.findByText(/grant permissions/i)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByText(/you are ready/i)
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({
        whisperModel: 'onnx-community/whisper-tiny',
        onboardingComplete: true
      })
    )
    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument())
  })
})
