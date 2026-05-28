import { describe, it, expect } from 'vitest'
import { isSupportedMacOSVersion } from './platform'

describe('isSupportedMacOSVersion', () => {
  it('returns true for Darwin 23.2 (macOS 14.2)', () => {
    expect(isSupportedMacOSVersion('23.2.0')).toBe(true)
  })

  it('returns true for Darwin 23.x where x > 2', () => {
    expect(isSupportedMacOSVersion('23.5.0')).toBe(true)
  })

  it('returns true for Darwin 24+ (macOS 15+)', () => {
    expect(isSupportedMacOSVersion('24.0.0')).toBe(true)
  })

  it('returns false for Darwin 23.1 (macOS 14.1)', () => {
    expect(isSupportedMacOSVersion('23.1.0')).toBe(false)
  })

  it('returns false for Darwin 23.0 (macOS 14.0)', () => {
    expect(isSupportedMacOSVersion('23.0.0')).toBe(false)
  })

  it('returns false for Darwin 22.x (macOS 13.x)', () => {
    expect(isSupportedMacOSVersion('22.6.0')).toBe(false)
  })

  it('handles partial version strings', () => {
    expect(isSupportedMacOSVersion('24')).toBe(true)
    expect(isSupportedMacOSVersion('22')).toBe(false)
  })
})
