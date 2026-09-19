// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { copyText } from './mobile.js'

describe('completed workout export clipboard', () => {
  it('copies the complete plain-text payload byte-for-byte', async () => {
    const originalClipboard = navigator.clipboard
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const text = 'Leg Day\nSet 1: 100×5 kg\nRIR 2\nNote: controlled tempo'

    await copyText(text)

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(text)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard })
  })
})
