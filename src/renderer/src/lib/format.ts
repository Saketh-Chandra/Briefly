/** Formats a duration in seconds to a human-readable string (e.g. "3m 42s"). */
export function formatDuration(s: number | null): string {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}
