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
  it.each([['Share with ChatGPT', 'https://chatgpt.com/?q=my%20workout'], ['Claude', 'https://claude.ai/new?q=my%20workout']])('copies before opening %s', async (label, url) => {
    await act(async () => button(label).click())
    expect(mocks.copy).toHaveBeenCalledWith('my workout')
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener')
    expect(mocks.copy.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0])
  })
  it('uses the base URL and asks for a paste when text is too long', async () => {
    act(() => root.render(<AiShareButtons getText={() => 'x'.repeat(8000)} />))
    await act(async () => button('Claude').click())
    expect(open).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener')
    expect(mocks.toast).toHaveBeenCalledWith('Copied. Paste it in Claude.')
  })
  it('still opens the provider when copying fails', async () => {
    mocks.copy.mockRejectedValueOnce(new Error('clipboard unavailable'))
    await act(async () => button('Claude').click())
    expect(open).toHaveBeenCalledWith('https://claude.ai/new?q=my%20workout', '_blank', 'noopener')
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/copy/i))
  })
})
