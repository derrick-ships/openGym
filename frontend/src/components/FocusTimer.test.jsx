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
    ui: { timer: null, work: null, addRest: vi.fn(), stopRest: vi.fn(), finishWorkEarly: vi.fn(), stopWork: vi.fn() },
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
  return <><RestTimer onExpand={() => focusRef.current?.expand()} /><FocusTimer ref={focusRef} /></>
}
const render = () => act(() => root.render(<Timers />))

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  useUI.setState({ timer: null, work: null })
  useStore.setState({ S: { focusTimer: true } })
  mocks.ui.finishWorkEarly.mockClear(); mocks.ui.stopWork.mockClear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
})
afterEach(() => {
  act(() => root.unmount()); host.remove(); document.body.classList.remove('resting', 'rest-guide'); vi.unstubAllGlobals()
})

describe('focus timer', () => {
  it('renders nothing without a work timer', () => {
    render()
    expect(host.querySelector('.focus-timer')).toBeNull()
  })

  it('opens for a work timer, displays its name and clock, and focuses Done', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    const overlay = host.querySelector('.focus-timer')
    expect(overlay.textContent).toContain('Weighted dead hang with neutral grip')
    expect(overlay.querySelector('[role="timer"]').textContent).toBe('1:15')
    expect(overlay.querySelector('[role="timer"]').getAttribute('aria-live')).toBe('off')
    expect(document.activeElement).toBe(overlay.querySelector('.focus-timer-done'))
  })

  it('keeps background controls inert while open and restores them on minimize', () => {
    act(() => useUI.setState({ work: hold() }))
    render()
    const bar = host.querySelector('#timer')
    expect(bar.inert).toBe(true)
    click(button('Minimize timer'))
    expect(bar.inert).toBe(false)
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

  it('marks reduced motion when requested', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
    act(() => useUI.setState({ work: hold(3) }))
    render()
    expect(host.querySelector('.focus-timer.reduced-motion')).toBeTruthy()
  })
})
