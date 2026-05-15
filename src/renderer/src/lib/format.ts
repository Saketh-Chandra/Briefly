/**
 * Formats a Date to a YYYY-MM-DD string using the **local** calendar date.
 * Do not use `toISOString().slice(0, 10)` — that returns the UTC date and
 * breaks in positive-offset timezones.
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Formats a duration in seconds to a human-readable string (e.g. "3m 42s"). */
export function formatDuration(s: number | null): string {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}
