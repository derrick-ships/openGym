// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Media from './Media.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: { gifSize: 'full' } }
  state.snapshot = () => ({
    S: state.S,
    update: mut => {
      const next = structuredClone(state.S)
      mut(next)
      state.S = next
    },
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector(mocks.snapshot())
  useStore.getState = mocks.snapshot
  return { useStore }
})

const EX = { id: 'bench', n: 'bench press', gif: 'bench.gif', img: 'bench.jpg' }
const PRIVATE_ANIMATED_EX = { id: 'custom-gif', n: 'custom gif', media: { id: 'asset-gif', mime: 'image/webp', animated: true, frames: 2 } }

let host, root
beforeEach(() => {
  mocks.S = { gifSize: 'full' }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const mount = props => act(() => root.render(<Media ex={EX} {...props} />))
const mountEx = (ex, props) => act(() => root.render(<Media ex={ex} {...props} />))

describe('Media gifSize', () => {
  it('renders the full animation by default and toggles to mini in the workout', () => {
    mount({ minimizable: true })
    expect(host.querySelector('.exmedia img')).toBeTruthy()
    expect(host.querySelector('.exmedia.mini')).toBeFalsy()
    act(() => { host.querySelector('.giftoggle').click() })
    expect(mocks.S.gifSize).toBe('mini')
    mount({ minimizable: true })
    expect(host.querySelector('.exmedia.mini')).toBeTruthy()
  })

  it("renders nothing at all in the workout when gifSize is 'off'", () => {
    mocks.S = { gifSize: 'off' }
    mount({ minimizable: true })
    expect(host.querySelector('.exmedia')).toBeFalsy()
    expect(host.querySelector('img')).toBeFalsy()
    expect(host.innerHTML).toBe('')
  })

  it("'off' only applies to the workout — the detail sheet (not minimizable) still shows media", () => {
    mocks.S = { gifSize: 'off' }
    mount({})
    expect(host.querySelector('.exmedia img')).toBeTruthy()
  })

  it('treats a legacy/unknown value as full', () => {
    mocks.S = { gifSize: 'huge' }
    mount({ minimizable: true })
    expect(host.querySelector('.exmedia img')).toBeTruthy()
    expect(host.querySelector('.exmedia.mini')).toBeFalsy()
  })

  it('pauses a private animated image on a captured frame and resumes the animation', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,still')
    mountEx(PRIVATE_ANIMATED_EX)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    const image = host.querySelector('.exmedia img')
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 32 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 32 })
    expect(host.querySelector('.gifhint')).toBeTruthy()
    expect(host.querySelector('.gifhint').getAttribute('aria-pressed')).toBe('false')
    act(() => { host.querySelector('.gifhint').click() })
    expect(host.querySelector('.exmedia img').src).toContain('data:image/png;base64,still')
    expect(host.querySelector('.gifhint').getAttribute('aria-pressed')).toBe('true')
    act(() => { host.querySelector('.gifhint').click() })
    expect(host.querySelector('.exmedia img').src).toContain('/api/assets/asset-gif')
    expect(host.querySelector('.gifhint').getAttribute('aria-pressed')).toBe('false')
  })
})
