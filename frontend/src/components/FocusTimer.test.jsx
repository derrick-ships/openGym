// @vitest-environment happy-dom
import React, { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FocusTimer from './FocusTimer.jsx'
import RestTimer from './RestTimer.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const mocks = vi.hoisted(() => {
  const uiListeners = new Set(), storeListeners = new Set()
  const mock = {
    ui: { timer: null, work: null, sheets: [], focusOpen: false, addRest: vi.fn(), stopRest: vi.fn(), finishWorkEarly: vi.fn(), stopWork: vi.fn() },
    store: { S: { focusTimer: true } },
    setUI(value) { mock.ui = { ...mock.ui, ...value }; uiListeners.forEach(listener => listener()) },
    setStore(value) { mock.store = { ...mock.store, ...value }; storeListeners.forEach(listener => listener()) },
    subscribeUI(listener) { uiListeners.add(listener); return () => uiListeners.delete(listener) },
    subscribeStore(listener) { storeListeners.add(listener); return () => storeListeners.delete(listener) },
  }
  return mock
})
vi.mock('../store/useUI.js', async () => {
  const React = await import('react')
  const useUI = (selector = value => value) => React.useSyncExternalStore(mocks.subscribeUI, () => selector(mocks.ui), () => selector(mocks.ui))
  useUI.getState = () => mocks.ui
  useUI.setState = value => mocks.setUI(value)
  return { useUI }
})
vi.mock('../store/useStore.js', async () => {
  const React = await import('react')
  const useStore = selector => React.useSyncExternalStore(mocks.subscribeStore, () => selector(mocks.store), () => selector(mocks.store))
  useStore.getState = () => mocks.store
  useStore.setState = value => mocks.setStore(value)
  return { useStore }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const hold = (left = 75, endsAt = 123456) => ({ left, total: 90, endsAt, label: 'Weighted dead hang with neutral grip' })
const button = name => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === name || el.getAttribute('aria-label') === name)
const click = element => act(() => element.click())
function Timers() {
  const focusRef = useRef(null)
  return <><RestTimer onExpand={() => focusRef.current?.expand()} /><FocusTimer ref={focusRef} /><div id="modal-root"><button>Sheet action</button></div><div id="toast" /></>
}
const render = () => act(() => root.render(<Timers />))

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  useUI.setState({ timer: null, work: null, sheets: [], focusOpen: false })
  useStore.setState({ S: { focusTimer: true } })
  mocks.ui.finishWorkEarly.mockClear(); mocks.ui.stopWork.mockClear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
})
afterEach(() => {
  act(() => root.unmount()); host.remove(); document.body.classList.remove('resting', 'rest-guide'); vi.unstubAllGlobals()
})

describe('focus timer', () => {
  it('never stacks work and breathing overlays', async () => {
    act(() => useUI.setState({ timer: { left: 90, total: 90, endsAt: Date.now() + 90000 } }))
    render()
    click(button('Breathe'))
    expect(host.querySelectorAll('.breathing-focus')).toHaveLength(1)
    act(() => useUI.setState({ timer: null, work: hold() }))
    expect(host.querySelectorAll('.breathing-focus')).toHaveLength(0)
    expect(host.querySelectorAll('.focus-timer')).toHaveLength(1)
  })

  it('renders nothing without a work timer', () => {
    render()
    expect(host.querySelector('.focus-timer')).toBeNull()
  })

  it('opens for a work timer, displays its name and clock, and focuses Done', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    const overlay = host.querySelector('.focus-timer')
    expect(host.querySelector('#timer.working')).toBeTruthy()
    expect(host.querySelectorAll('.focus-timer')).toHaveLength(1)
    expect(document.documentElement.classList.contains('focus-timer-open')).toBe(true)
    expect(overlay.textContent).toContain('Weighted dead hang with neutral grip')
    expect(overlay.querySelector('[role="timer"]').textContent).toBe('1:15')
    expect(overlay.querySelector('[role="timer"]').getAttribute('aria-live')).toBe('off')
    expect(document.activeElement).toBe(overlay.querySelector('.focus-timer-done'))
  })

  it('restores the underlying scroll position when minimized', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.stubGlobal('scrollY', 250)
    act(() => useUI.setState({ work: hold() }))
    render()
    expect(document.documentElement.style.getPropertyValue('--focus-scroll-offset')).toBe('-250px')
    click(button('Minimize timer'))
    expect(document.documentElement.style.getPropertyValue('--focus-scroll-offset')).toBe('')
    expect(scrollTo).toHaveBeenCalledWith(0, 250)
    scrollTo.mockRestore()
  })

  it('clears its native back hook on unmount', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    expect(useUI.getState().focusOpen).toBe(true)
    act(() => root.render(null))
    expect(useUI.getState().focusOpen).toBe(false)
    expect(useUI.getState().minimizeFocus).toBeNull()
  })

  it('keeps background controls inert while open and restores them on minimize', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    const bar = host.querySelector('#timer')
    expect(bar.inert).toBe(true)
    expect(host.querySelector('#modal-root').inert).toBe(false)
    expect(host.querySelector('#toast').inert).toBe(false)
    click(button('Minimize timer'))
    expect(bar.inert).toBe(false)
    expect(document.documentElement.classList.contains('focus-timer-open')).toBe(false)
  })

  it('yields Escape and Tab to an open sheet, then minimizes on Escape once closed', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    expect(useUI.getState().focusOpen).toBe(true)
    act(() => useUI.setState({ sheets: [{ id: 'sheet' }] }))
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => document.dispatchEvent(escape))
    expect(escape.defaultPrevented).toBe(false)
    expect(host.querySelector('.focus-timer')).toBeTruthy()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => document.dispatchEvent(tab))
    expect(tab.defaultPrevented).toBe(false)
    act(() => useUI.setState({ sheets: [] }))
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.focus-timer')).toBeNull()
    expect(useUI.getState().focusOpen).toBe(false)
  })

  it('minimizes when Android back requests it and reopens for the next hold', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    act(() => useUI.getState().minimizeFocus())
    expect(host.querySelector('.focus-timer')).toBeNull()
    expect(useUI.getState().focusOpen).toBe(false)
    act(() => useUI.setState({ work: hold(90, 223456) }))
    expect(host.querySelector('.focus-timer')).toBeTruthy()
    expect(useUI.getState().focusOpen).toBe(true)
  })

  it('does not auto-open when disabled, but the work bar can expand it', () => {
    act(() => { useStore.setState({ S: { focusTimer: false } }); useUI.setState({ work: hold() }) })
    render()
    expect(host.querySelector('.focus-timer')).toBeNull()
    click(button('Expand timer'))
    expect(host.querySelector('.focus-timer [role="timer"]').textContent).toBe('1:15')
  })

  it('finishes early or stops via the existing work actions', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    click(host.querySelector('.focus-timer-done'))
    click(host.querySelector('.focus-timer-stop'))
    expect(mocks.ui.finishWorkEarly).toHaveBeenCalledTimes(1)
    expect(mocks.ui.stopWork).toHaveBeenCalledTimes(1)
  })

  it('minimizes for this hold, reopens from the bar, and resets for the next hold', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    click(button('Minimize timer'))
    expect(host.querySelector('.focus-timer')).toBeNull()
    act(() => useUI.setState({ work: hold(74) }))
    expect(host.querySelector('.focus-timer')).toBeNull()
    click(button('Expand timer'))
    expect(host.querySelector('.focus-timer')).toBeTruthy()
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.focus-timer')).toBeNull()
    act(() => useUI.setState({ work: hold(90, 223456) }))
    expect(host.querySelector('.focus-timer')).toBeTruthy()
  })

  it('does not carry minimized state across stopped holds with the same end time', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    click(button('Minimize timer'))
    act(() => useUI.setState({ work: null }))
    act(() => useUI.setState({ work: hold() }))
    expect(host.querySelector('.focus-timer')).toBeTruthy()
  })

  it('announces only the 10- and 3-second milestones', () => {
    act(() => useUI.setState({ work: hold(11) }))
    render()
    const announcement = host.querySelector('.focus-timer [aria-live="polite"]')
    expect(announcement.textContent).toBe('')
    act(() => useUI.setState({ work: hold(10) }))
    expect(announcement.textContent).toBe('10 seconds remaining')
    act(() => useUI.setState({ work: hold(9) }))
    expect(announcement.textContent).toBe('')
    act(() => useUI.setState({ work: hold(3) }))
    expect(announcement.textContent).toBe('3 seconds remaining')
  })

  it('uses compact clock styling for ten-minute holds', () => {
    act(() => useUI.setState({ work: hold(600) }))
    render()
    expect(host.querySelector('.focus-timer-clock.long').textContent).toBe('10:00')
  })

  it('marks reduced motion when requested', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
    act(() => useUI.setState({ work: hold(3) }))
    render()
    expect(host.querySelector('.focus-timer.reduced-motion')).toBeTruthy()
  })
})
