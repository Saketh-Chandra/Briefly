import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetPassword, mockSetPassword, mockDeletePassword } = vi.hoisted(() => ({
  mockGetPassword: vi.fn(),
  mockSetPassword: vi.fn(),
  mockDeletePassword: vi.fn()
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: mockGetPassword,
    setPassword: mockSetPassword,
    deletePassword: mockDeletePassword
  }
}))

import { getApiKey, setApiKey, deleteApiKey } from './keychain'

const SERVICE = 'Briefly'

describe('keychain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getApiKey reads from the Briefly service', async () => {
    mockGetPassword.mockResolvedValueOnce('sk-stored')
    await expect(getApiKey('llm-api-key')).resolves.toBe('sk-stored')
    expect(mockGetPassword).toHaveBeenCalledWith(SERVICE, 'llm-api-key')
  })

  it('getApiKey returns null when no password is stored', async () => {
    mockGetPassword.mockResolvedValueOnce(null)
    await expect(getApiKey('llm-api-key')).resolves.toBeNull()
  })

  it('setApiKey writes to the Briefly service', async () => {
    mockSetPassword.mockResolvedValueOnce(undefined)
    await setApiKey('llm-api-key', 'sk-new')
    expect(mockSetPassword).toHaveBeenCalledWith(SERVICE, 'llm-api-key', 'sk-new')
  })

  it('deleteApiKey removes the Briefly service password', async () => {
    mockDeletePassword.mockResolvedValueOnce(true)
    await deleteApiKey('llm-api-key')
    expect(mockDeletePassword).toHaveBeenCalledWith(SERVICE, 'llm-api-key')
  })
})
