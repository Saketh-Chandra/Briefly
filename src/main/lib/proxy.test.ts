import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSetProxy } = vi.hoisted(() => ({
  mockSetProxy: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      setProxy: mockSetProxy
    }
  }
}))

import { applyProxy } from './proxy'
import type { ProxySettings } from './types'

describe('applyProxy — mode: none', () => {
  beforeEach(() => mockSetProxy.mockClear())

  it('sets direct config', async () => {
    await applyProxy({ mode: 'none' })
    expect(mockSetProxy).toHaveBeenCalledWith({ mode: 'direct' })
  })
})

describe('applyProxy — mode: system (default)', () => {
  beforeEach(() => mockSetProxy.mockClear())

  it('sets system config when mode is system', async () => {
    await applyProxy({ mode: 'system' })
    expect(mockSetProxy).toHaveBeenCalledWith({ mode: 'system' })
  })

  it('sets system config when proxy is undefined', async () => {
    await applyProxy(undefined)
    expect(mockSetProxy).toHaveBeenCalledWith({ mode: 'system' })
  })
})

describe('applyProxy — mode: auto_detect', () => {
  beforeEach(() => mockSetProxy.mockClear())

  it('sets auto_detect config', async () => {
    await applyProxy({ mode: 'auto_detect' })
    expect(mockSetProxy).toHaveBeenCalledWith({ mode: 'auto_detect' })
  })
})

describe('applyProxy — mode: pac', () => {
  beforeEach(() => mockSetProxy.mockClear())

  it('sets pac_script config with pacScript URL', async () => {
    await applyProxy({ mode: 'pac', pacUrl: 'http://proxy.example.com/proxy.pac' })
    expect(mockSetProxy).toHaveBeenCalledWith({
      mode: 'pac_script',
      pacScript: 'http://proxy.example.com/proxy.pac'
    })
  })

  it('falls back to system when PAC mode has no pacUrl', async () => {
    await applyProxy({ mode: 'pac' })
    expect(mockSetProxy).toHaveBeenCalledWith({ mode: 'system' })
  })
})

describe('applyProxy — mode: manual / HTTP proxy', () => {
  beforeEach(() => mockSetProxy.mockClear())

  it('builds fixed_servers config with HTTP proxy rules', async () => {
    const settings: ProxySettings = {
      mode: 'manual',
      httpProxy: 'proxy.corp.example',
      httpPort: 8080
    }
    await applyProxy(settings)
    const config = mockSetProxy.mock.calls[0][0] as Electron.ProxyConfig
    expect(config.mode).toBe('fixed_servers')
    expect((config as { proxyRules: string }).proxyRules).toContain('http=http://proxy.corp.example:8080')
  })

  it('includes https rules when useHttpForHttps is true', async () => {
    const settings: ProxySettings = {
      mode: 'manual',
      httpProxy: 'proxy.corp.example',
      httpPort: 8080,
      useHttpForHttps: true
    }
    await applyProxy(settings)
    const config = mockSetProxy.mock.calls[0][0] as { proxyRules: string }
    expect(config.proxyRules).toContain('https=http://proxy.corp.example:8080')
  })

  it('includes separate https proxy when defined and useHttpForHttps is false', async () => {
    const settings: ProxySettings = {
      mode: 'manual',
      httpProxy: 'http.proxy.example',
      httpPort: 8080,
      useHttpForHttps: false,
      httpsProxy: 'https.proxy.example',
      httpsPort: 8443
    }
    await applyProxy(settings)
    const config = mockSetProxy.mock.calls[0][0] as { proxyRules: string }
    expect(config.proxyRules).toContain('https=http://https.proxy.example:8443')
  })

  it('sets proxyBypassRules to noProxy when provided', async () => {
    const settings: ProxySettings = {
      mode: 'manual',
      httpProxy: 'proxy.corp.example',
      httpPort: 8080,
      noProxy: 'localhost,127.0.0.1'
    }
    await applyProxy(settings)
    const config = mockSetProxy.mock.calls[0][0] as { proxyBypassRules: string }
    expect(config.proxyBypassRules).toBe('localhost,127.0.0.1')
  })

  it('defaults bypassRules to <local> when noProxy is not provided', async () => {
    const settings: ProxySettings = {
      mode: 'manual',
      httpProxy: 'proxy.corp.example',
      httpPort: 8080
    }
    await applyProxy(settings)
    const config = mockSetProxy.mock.calls[0][0] as { proxyBypassRules: string }
    expect(config.proxyBypassRules).toBe('<local>')
  })

  it('sets direct config when manual mode has no proxy rules configured', async () => {
    await applyProxy({ mode: 'manual' })
    expect(mockSetProxy).toHaveBeenCalledWith({ mode: 'direct' })
  })
})

describe('applyProxy — mode: manual / SOCKS proxy', () => {
  beforeEach(() => mockSetProxy.mockClear())

  it('builds socks5:// rule for SOCKS5 proxy', async () => {
    const settings: ProxySettings = {
      mode: 'manual',
      socksHost: 'socks.proxy.example',
      socksPort: 1080,
      socksVersion: 5
    }
    await applyProxy(settings)
    const config = mockSetProxy.mock.calls[0][0] as { proxyRules: string }
    expect(config.proxyRules).toContain('socks5://socks.proxy.example:1080')
  })

  it('builds socks4:// rule for SOCKS4 proxy', async () => {
    const settings: ProxySettings = {
      mode: 'manual',
      socksHost: 'socks4.proxy.example',
      socksPort: 1080,
      socksVersion: 4
    }
    await applyProxy(settings)
    const config = mockSetProxy.mock.calls[0][0] as { proxyRules: string }
    expect(config.proxyRules).toContain('socks4://socks4.proxy.example:1080')
  })
})
