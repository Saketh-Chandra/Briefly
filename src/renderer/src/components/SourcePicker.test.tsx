import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'jotai'
import SourcePicker from './SourcePicker'

vi.mock('@/lib/api', () => ({
  api: {
    getSources: vi.fn()
  }
}))

import { api } from '@/lib/api'

const screens = [
  {
    id: 'screen:0',
    name: 'Built-in Display',
    display_id: '1',
    thumbnail: '',
    appIcon: null
  }
]

const windows = [
  {
    id: 'window:42',
    name: 'Slack',
    display_id: '',
    thumbnail: '',
    appIcon: null
  }
]

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.hasPointerCapture = vi.fn()
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        /* jsdom stub */
      }
      unobserve(): void {
        /* jsdom stub */
      }
      disconnect(): void {
        /* jsdom stub */
      }
    }
  )
})

describe('SourcePicker', () => {
  // Radix dropdown open is pointer-capture + portal work (~500ms). Keep user-event;
  // do not add waitFor timeouts beyond the default.
  it('loads sources when the menu opens and lists screens and windows', async () => {
    vi.mocked(api.getSources).mockResolvedValue([...screens, ...windows])
    const user = userEvent.setup()
    render(
      <Provider>
        <SourcePicker />
      </Provider>
    )

    await user.click(screen.getByRole('button', { name: /select source/i }))
    await waitFor(() => expect(api.getSources).toHaveBeenCalledOnce())
    expect((await screen.findAllByText('Built-in Display')).length).toBeGreaterThan(0)
    expect(screen.getByText('Slack')).toBeInTheDocument()
    expect(screen.getByText(/^screens$/i)).toBeInTheDocument()
    expect(screen.getByText(/^windows/i)).toBeInTheDocument()
  })

  it('shows an empty-permission message when no sources are returned', async () => {
    vi.mocked(api.getSources).mockResolvedValue([])
    const user = userEvent.setup()
    render(
      <Provider>
        <SourcePicker />
      </Provider>
    )
    await user.click(screen.getByRole('button', { name: /select source/i }))
    expect(await screen.findByText(/no sources found/i)).toBeInTheDocument()
    expect(screen.getByText(/grant screen recording permission/i)).toBeInTheDocument()
  })

  it('auto-selects the first screen after sources load', async () => {
    vi.mocked(api.getSources).mockResolvedValue([...screens, ...windows])
    const user = userEvent.setup()
    render(
      <Provider>
        <SourcePicker />
      </Provider>
    )
    await user.click(screen.getByRole('button', { name: /select source/i }))
    await waitFor(() =>
      expect(document.querySelector('[data-slot="dropdown-menu-trigger"]')).toHaveTextContent(
        'Built-in Display'
      )
    )
  })

  it('does not throw when getSources rejects', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.getSources).mockRejectedValue(new Error('ipc failed'))
    const user = userEvent.setup()
    render(
      <Provider>
        <SourcePicker />
      </Provider>
    )
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /select source/i }))
    })
    await waitFor(() => expect(api.getSources).toHaveBeenCalledOnce())
    error.mockRestore()
  })
})
