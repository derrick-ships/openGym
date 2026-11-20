// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiShareButtons } from './AiButtons.jsx'

const mocks = vi.hoisted(() => ({ copy: vi.fn(), toast: vi.fn() }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...await importOriginal(), copyText: mocks.copy }))
vi.mock('../store/useUI.js', () => ({ useUI: selector => selector({ toast: mocks.toast }) }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host, open
beforeEach(() => {
  mocks.copy.mockReset().mockResolvedValue(undefined)
  mocks.toast.mockReset()
  open = vi.spyOn(window, 'open').mockImplementation(() => null)
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<AiShareButtons getText={() => 'my workout'} />))
})
afterEach(() => { act(() => root.unmount()); host.remove(); open.mockRestore() })
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent.includes(text))

describe('AI handoff buttons', () => {
  it.each([['Track it in ChatGPT', 'https://chatgpt.com/', /saved memory.*progress log/is], ['Review it with Claude', 'https://claude.ai/new', /Project.*debrief.*adjustment/is]])('copies the tailored prompt before opening %s', async (label, base, prompt) => {
    await act(async () => button(label).click())
    const text = mocks.copy.mock.calls[0][0]
    expect(text).toContain('my workout')
    expect(text).toMatch(prompt)
    expect(open).toHaveBeenCalledWith(`${base}?q=${encodeURIComponent(text)}`, '_blank', 'noopener')
    expect(mocks.copy.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0])
    expect(button(label).querySelector('svg path')).toBeTruthy()
  })
  it('opens a compact prompt but copies the full text first', async () => {
    const full = 'full workout '.repeat(1000)
    act(() => root.render(<AiShareButtons getText={() => full} getLinkText={() => 'compact workout'} />))
    await act(async () => button('Claude').click())
    expect(mocks.copy.mock.calls[0][0]).toContain(full)
    expect(mocks.copy.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0])
    expect(new URL(open.mock.calls[0][0]).searchParams.get('q')).toContain('compact workout')
    expect(mocks.toast).toHaveBeenCalledWith('Opening Claude…')
  })
  it('opens a prefilled short prompt and asks for a paste when even the compact text is too long', async () => {
    const full = 'x'.repeat(9000)
    act(() => root.render(<AiShareButtons getText={() => full} getLinkText={() => '🏋️'.repeat(1000)} />))
    await act(async () => button('Claude').click())
    expect(mocks.copy.mock.calls[0][0]).toContain(full)
    expect(mocks.copy.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0])
    expect(new URL(open.mock.calls[0][0]).searchParams.get('q')).toMatch(/Project[\s\S]*clipboard.*wait for it/)
    expect(mocks.toast).toHaveBeenCalledWith('Copied. Paste it in Claude after it opens.')
  })
  it('still opens the provider when copying fails', async () => {
    mocks.copy.mockRejectedValueOnce(new Error('clipboard unavailable'))
    await act(async () => button('Claude').click())
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\/claude\.ai\/new\?q=/)
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain('my workout')
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/copy/i))
  })
})
