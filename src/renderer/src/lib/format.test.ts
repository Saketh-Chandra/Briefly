import { describe, it, expect } from 'vitest'
import { toLocalISODate, formatDuration } from './format'

describe('toLocalISODate', () => {
  it('formats a date to YYYY-MM-DD using local calendar', () => {
    const d = new Date(2024, 0, 5) // Jan 5 2024 local time
    expect(toLocalISODate(d)).toBe('2024-01-05')
  })

  it('zero-pads month and day', () => {
    const d = new Date(2024, 2, 3) // Mar 3 2024
    expect(toLocalISODate(d)).toBe('2024-03-03')
  })

  it('handles end-of-year date', () => {
    const d = new Date(2023, 11, 31) // Dec 31 2023
    expect(toLocalISODate(d)).toBe('2023-12-31')
  })
})

describe('formatDuration', () => {
  it('returns em dash for null', () => {
    expect(formatDuration(null)).toBe('—')
  })

  it('formats seconds-only duration', () => {
    expect(formatDuration(45)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(222)).toBe('3m 42s')
  })

  it('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1m 0s')
  })

  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0s')
  })
})
