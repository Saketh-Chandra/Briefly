# Proxy Implementation

## Scope

Proxy applies **only to HuggingFace model downloads** — i.e. traffic from:
- The Web Worker (`fetch()` calls made by `@huggingface/transformers`)
- `electron.net.fetch` in the main process (`hf:test-mirror` IPC handler)

**Not proxied:** LLM API calls (OpenAI SDK → Node.js `https` module). Node's network stack is independent of Chromium's session proxy and would need a separate `HttpsProxyAgent` — not implemented.

---

## Architecture

```
Settings UI (renderer)
  └── window.api.saveSettings({ proxy })
        └── IPC: settings:save
              ├── saveSettings(rest)        ← persist to settings.json
              └── applyProxy(getSettings().proxy)   ← live apply, no restart needed

app.whenReady()
  └── await applyProxy(getSettings().proxy)  ← apply on startup before createWindow()
```

`applyProxy` calls `session.defaultSession.setProxy(config)` — this is async and takes effect immediately for all subsequent requests on the default Chromium session (Web Worker fetches + `electron.net`).

---

## Files

| File | Role |
|---|---|
| `src/main/lib/proxy.ts` | `applyProxy()` + `buildProxyRules()` |
| `src/main/lib/types.ts` | `ProxySettings` interface, `AppSettings.proxy` field |
| `src/main/index.ts` | `await applyProxy(getSettings().proxy)` on startup |
| `src/main/ipc/settings.ts` | `await applyProxy(getSettings().proxy)` after each save |
| `src/renderer/src/pages/Settings.tsx` | Firefox-style proxy UI section |

---

## `ProxySettings` Type

```typescript
interface ProxySettings {
  mode: 'none' | 'system' | 'auto_detect' | 'manual' | 'pac'
  // Manual — HTTP/HTTPS
  httpProxy?: string
  httpPort?: number
  useHttpForHttps?: boolean   // reuse HTTP proxy for HTTPS too
  httpsProxy?: string
  httpsPort?: number
  // Manual — SOCKS
  socksHost?: string
  socksPort?: number
  socksVersion?: 4 | 5
  proxyDnsViaSocks?: boolean  // stored only; Chromium SOCKS5 always does remote DNS
  // PAC
  pacUrl?: string
  // Shared
  noProxy?: string            // comma-separated bypass list
}
```

Default when `proxy` is absent from settings: `{ mode: 'system' }` (inherit macOS proxy settings).

---

## Mode Mapping

| UI Selection | `mode` value | Electron `ProxyConfig` sent |
|---|---|---|
| No proxy | `none` | `{ mode: 'direct' }` |
| Auto-detect | `auto_detect` | `{ mode: 'auto_detect' }` |
| System proxy *(default)* | `system` | `{ mode: 'system' }` |
| Manual | `manual` | `{ mode: 'fixed_servers', proxyRules, proxyBypassRules }` |
| PAC URL | `pac` | `{ mode: 'pac_script', pacScript: url }` |

---

## `proxyRules` String Format (Manual mode)

Chromium's `fixed_servers` mode expects a semicolon-separated list. Two forms exist:

| Form | Example | Meaning |
|---|---|---|
| `scheme=url` | `http=http://proxy:3128` | Proxy only requests whose **destination** uses `scheme` |
| URI only | `socks5://proxy:1080` | Fallback proxy for **all protocols** |

### Critical: SOCKS must use URI form

`socks5=localhost:1080` (key=value) means "proxy destinations whose URL scheme is `socks5`" — no real HTTPS fetch ever has a `socks5://` destination, so the rule is **silently ignored** and traffic goes direct.

`socks5://localhost:1080` (URI form, no `=`) is Chromium's catch-all fallback — used for any protocol not matched by a more specific rule. Always use this form for SOCKS.

### Example outputs from `buildProxyRules()`

SOCKS5 only:
```
socks5://localhost:1080
```

HTTP + HTTPS separate:
```
http=http://proxy.corp.com:3128;https=http://proxy.corp.com:8080
```

HTTP + reuse for HTTPS:
```
http=http://proxy.corp.com:3128;https=http://proxy.corp.com:3128
```

HTTP + SOCKS fallback:
```
http=http://proxy.corp.com:3128;socks5://proxy.corp.com:1080
```

---

## Bypass Rules

Default when "No proxy for" is blank: `<local>`

`<local>` is Chromium's built-in keyword covering all loopback addresses and bare hostnames (no dots). This prevents the Vite dev server (`localhost:5173`) from being sent through the proxy.

User-supplied bypass list (e.g. `10.0.0.0/8,internal.corp.com`) is passed as-is to `proxyBypassRules`. Chromium accepts both comma and semicolon as separators.

---

## SOCKS DNS ("Proxy DNS when using SOCKS v5")

The `proxyDnsViaSocks` field is stored in settings but **has no effect at runtime**. Chromium SOCKS5 always passes the hostname to the proxy server for remote resolution — it never pre-resolves DNS locally for SOCKS connections. This matches the behaviour of `curl --socks5-hostname` (i.e. `socks5h` in libcurl).

The `socks5h` scheme used by libcurl/curl is **not recognised by Chromium** and results in the rule being silently dropped. Always use `socks5`.

---

## Corporate Proxy (Zscaler) Notes

Tested with an SSH SOCKS5 tunnel (`ssh -D 1080 -C -N user@host`) to bypass Zscaler:

1. Only the URI form (`socks5://localhost:1080`) worked — key=value form was silently dropped
2. Chromium resolves DNS through the SOCKS server automatically, so remote HF hosts resolve correctly even when Zscaler intercepts local DNS
3. `<local>` bypass ensures the Vite dev server remains accessible during development

---

## Model Caching

Model files downloaded through the proxy are stored in the browser **Cache API** (`caches.open('briefly-transformers-v2')`), not on the filesystem. This is controlled by `env.useBrowserCache = true` in the Web Worker.

`getModelStatus` (IPC: `transcription:model-status`) checks the filesystem only and will always return `{ present: false }` for models in the browser cache. The Settings page therefore:
1. After successful download: sets `modelPresent = true` directly from `model_ready` event (does not call `getModelStatus`)
2. On page load: calls `getModelStatus` first; if absent, checks `caches.open('briefly-transformers-v2')` for a matching URL key
