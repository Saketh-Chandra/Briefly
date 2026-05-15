/**
 * Returns true if the Darwin (macOS) kernel version supports loopback
 * audio capture — requires macOS 14.2 Sonoma (Darwin 23.2+).
 */
export function isSupportedMacOSVersion(darwinVersion: string): boolean {
  const parts = darwinVersion.split('.').map(Number)
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  return major > 23 || (major === 23 && minor >= 2)
}
