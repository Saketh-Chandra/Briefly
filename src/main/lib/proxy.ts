import { session } from 'electron'
import type { ProxySettings } from './types'

function buildProxyRules(p: ProxySettings): string {
  const parts: string[] = []

  if (p.httpProxy && p.httpPort) {
    parts.push(`http=http://${p.httpProxy}:${p.httpPort}`)
    if (p.useHttpForHttps) {
      parts.push(`https=http://${p.httpProxy}:${p.httpPort}`)
    } else if (p.httpsProxy && p.httpsPort) {
      parts.push(`https=http://${p.httpsProxy}:${p.httpsPort}`)
    }
  }

  if (p.socksHost && p.socksPort) {
    // URI form (no "=" prefix) → Chromium uses this as fallback for ALL protocols,
    // including https. "socks5=host:port" (key=value form) only matches connections
    // whose destination scheme is "socks5", which is never true for HF fetches.
    const scheme = p.socksVersion === 4 ? 'socks4' : 'socks5'
    parts.push(`${scheme}://${p.socksHost}:${p.socksPort}`)
  }

  return parts.join(';')
}

export async function applyProxy(proxy?: ProxySettings): Promise<void> {
  const p = proxy ?? { mode: 'system' as const }

  let config: Electron.ProxyConfig

  switch (p.mode) {
    case 'none':
      config = { mode: 'direct' }
      break

    case 'auto_detect':
      config = { mode: 'auto_detect' }
      break

    case 'pac':
      config = p.pacUrl
        ? { mode: 'pac_script', pacScript: p.pacUrl }
        : { mode: 'system' }
      break

    case 'manual': {
      const rules = buildProxyRules(p)
      if (!rules) {
        config = { mode: 'direct' }
        break
      }
      // '<local>' is Chromium's built-in keyword for all loopback/local addresses.
      // This ensures the Vite dev server (localhost:5173) and similar are never proxied.
      const bypass = p.noProxy?.trim() || '<local>'
      config = { mode: 'fixed_servers', proxyRules: rules, proxyBypassRules: bypass }
      break
    }

    case 'system':
    default:
      config = { mode: 'system' }
  }

  await session.defaultSession.setProxy(config)
}
