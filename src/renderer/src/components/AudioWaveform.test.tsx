import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import AudioWaveform from './AudioWaveform'

function barHeights(container: HTMLElement): number[] {
  return Array.from(container.firstElementChild?.children ?? []).map((el) =>
    parseInt((el as HTMLElement).style.height, 10)
  )
}

describe('AudioWaveform', () => {
  it('renders five bars by default', () => {
    const { container } = render(<AudioWaveform level={0} active={false} />)
    expect(container.firstElementChild?.children).toHaveLength(5)
  })

  it('renders the requested number of bars', () => {
    const { container } = render(<AudioWaveform level={0} active={false} barCount={7} />)
    expect(container.firstElementChild?.children).toHaveLength(7)
  })

  it('applies a custom className on the wrapper', () => {
    const { container } = render(
      <AudioWaveform level={0} active={false} className="mt-2 opacity-80" />
    )
    expect(container.firstElementChild).toHaveClass('mt-2', 'opacity-80')
  })

  it('keeps idle bars at the 3px floor regardless of level', () => {
    const { container } = render(<AudioWaveform level={1} active={false} />)
    expect(barHeights(container).every((h) => h === 3)).toBe(true)
  })

  it('floors active bars at 3px when the level is zero', () => {
    const { container } = render(<AudioWaveform level={0} active />)
    expect(barHeights(container).every((h) => h === 3)).toBe(true)
  })

  it('scales active bar heights from the level and per-bar multipliers', () => {
    const { container } = render(<AudioWaveform level={1} active barCount={5} />)
    // multipliers: 0.6, 0.9, 1.0, 0.85, 0.65 → round(h * 20)
    expect(barHeights(container)).toEqual([12, 18, 20, 17, 13])
  })

  it('wraps multipliers when barCount exceeds the table', () => {
    const { container } = render(<AudioWaveform level={1} active barCount={7} />)
    expect(barHeights(container)).toEqual([12, 18, 20, 17, 13, 15, 19])
  })

  it('updates heights when the level changes', () => {
    const { container, rerender } = render(<AudioWaveform level={1} active />)
    expect(barHeights(container)[2]).toBe(20)
    rerender(<AudioWaveform level={0.5} active />)
    expect(barHeights(container)[2]).toBe(10)
  })
})
