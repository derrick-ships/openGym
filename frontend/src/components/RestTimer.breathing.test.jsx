// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RestTimer from './RestTimer.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const mocks = vi.hoisted(() => {
  const uiListeners = new Set()
  const storeListeners = new Set()
  const mock = {
    ui: {
      timer: null,
      work: null,
      addRest: vi.fn(),
      stopRest() { mock.setUI({ timer: null }) },
      finishWorkEarly: vi.fn(),
      stopWork: vi.fn(),
    },
    store: { S: { breathingExercise: 'coherent', breathingHaptics: true } },
    uiListeners,
    storeListeners,
    setUI(value) { mock.ui = { ...mock.ui, ...value }; uiListeners.forEach(listener => listener()) },
    setStore(value) { mock.store = { ...mock.store, ...value }; storeListeners.forEach(listener => listener()) },
    subscribeUI(listener) { uiListeners.add(listener); return () => uiListeners.delete(listener) },
    subscribeStore(listener) { storeListeners.add(listener); return () => storeListeners.delete(listener) },
    phaseBoundaryHaptic: vi.fn(() => Promise.resolve()),
  }
  return mock
})

vi.mock('../store/useUI.js', async () => {
  const React = await import('react')
  const useUI = (selector = value => value) => React.useSyncExternalStore(mocks.subscribeUI, () => selector(mocks.ui), () => selector(mocks.ui))
  useUI.getState = () => mocks.ui
  useUI.setState = value => mocks.setUI(typeof value === 'function' ? value(mocks.ui) : value)
  return { useUI }
})
vi.mock('../store/useStore.js', async () => {
  const React = await import('react')
  const useStore = (selector = value => value) => React.useSyncExternalStore(mocks.subscribeStore, () => selector(mocks.store), () => selector(mocks.store))
  useStore.getState = () => mocks.store
  useStore.setState = value => mocks.setStore(typeof value === 'function' ? value(mocks.store) : value)
  return { useStore }
})
vi.mock('../lib/breathing-haptics.js', () => ({ phaseBoundaryHaptic: mocks.phaseBoundaryHaptic }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host
let root
let savedSettings

const rest = (seconds = 90) => ({ left: seconds, total: seconds, endsAt: Date.now() + seconds * 1000, forIdx: 0 })

const render = () => act(() => root.render(<RestTimer />))
const click = async element => act(async () => { element.click(); await Promise.resolve() })
const button = (name, base = host) => [...base.querySelectorAll('button')].find(item => item.textContent.trim() === name || item.getAttribute('aria-label') === name)

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  savedSettings = { ...useStore.getState().S }
  useStore.setState({ S: { ...savedSettings, breathingExercise: 'coherent', breathingHaptics: true } })
  useUI.setState({ timer: null, work: null })
  mocks.ui.addRest.mockClear()
  mocks.phaseBoundaryHaptic.mockClear()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useUI.setState({ timer: null, work: null })
  useStore.setState({ S: savedSettings })
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.body.classList.remove('resting')
  vi.useRealTimers()
})

describe('breathing guide in the rest timer', () => {
  it('appears only during rest, beside the clock, without replacing rest controls', async () => {
    render()
    expect(button('Breathe')).toBeUndefined()

    act(() => useUI.setState({ timer: rest() }))
    render()
    expect(button('Breathe')).toBeTruthy()
    expect(button('Breathe').getAttribute('aria-controls')).toBeNull()
    expect(button('Skip')).toBeTruthy()
    expect(host.querySelectorAll('#timer.rest .acts button')).toHaveLength(3)

    await click(button('Breathe'))
    expect(host.querySelector('.breathing-guide')).toBeTruthy()
    expect(button('Close breathing guide').getAttribute('aria-controls')).toBe('breathing-guide')
    expect(host.querySelector('#timer.rest .head .t').textContent).toBe('1:30')
    expect(button('15s')).toBeTruthy()
    expect(button('Skip')).toBeTruthy()
  })

  it('closes the guide without changing the rest timer', async () => {
    const currentRest = rest()
    act(() => useUI.setState({ timer: currentRest }))
    render()
    await click(button('Breathe'))

    await click(button('Close breathing guide'))

    expect(host.querySelector('.breathing-guide')).toBeNull()
    expect(useUI.getState().timer).toBe(currentRest)
  })

  it('keeps the guide open while the rest controls add or subtract 15 seconds', async () => {
    const currentRest = rest()
    act(() => useUI.setState({ timer: currentRest }))
    render()
    await click(button('Breathe'))

    const controls = host.querySelectorAll('#timer.rest .acts button')
    await click(controls[0])
    await click(controls[1])

    expect(mocks.ui.addRest).toHaveBeenNthCalledWith(1, -15)
    expect(mocks.ui.addRest).toHaveBeenNthCalledWith(2, 15)
    expect(useUI.getState().timer).toBe(currentRest)
    expect(host.querySelector('.breathing-guide')).toBeTruthy()
  })

  it('closes when a different rest timer replaces the active rest', async () => {
    act(() => useUI.setState({ timer: rest(90) }))
    render()
    await click(button('Breathe'))
    expect(host.querySelector('.breathing-guide')).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve() })
    act(() => useUI.setState({ timer: rest(75) }))

    expect(host.querySelector('.breathing-guide')).toBeNull()
    expect(button('Breathe')).toBeTruthy()
  })

  it('keeps the guide when the active rest follows its exercise to a new index', async () => {
    const currentRest = rest(90)
    act(() => useUI.setState({ timer: currentRest }))
    render()
    await click(button('Breathe'))

    act(() => useUI.setState({ timer: { ...currentRest, forIdx: 1 } }))

    expect(host.querySelector('.breathing-guide')).toBeTruthy()
  })

  it('closes with rest skip and never appears over a work timer', async () => {
    act(() => useUI.setState({ timer: rest() }))
    render()
    await click(button('Breathe'))
    await click(button('Skip'))
    expect(useUI.getState().timer).toBeNull()
    expect(host.querySelector('.breathing-guide')).toBeNull()

    act(() => useUI.setState({ work: { left: 30, total: 30, endsAt: Date.now() + 30_000, label: 'Hold' } }))
    render()
    expect(host.querySelector('#timer.working')).toBeTruthy()
    expect(button('Breathe')).toBeUndefined()
  })

  it('closes naturally when the rest expires', async () => {
    act(() => useUI.setState({ timer: rest(3) }))
    render()
    await click(button('Breathe'))
    expect(host.querySelector('.breathing-guide')).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve() })
    expect(host.querySelector('.breathing-guide')).toBeNull()
    expect(button('Breathe').getAttribute('aria-controls')).toBeNull()
    act(() => useUI.setState({ timer: null }))

    expect(button('Breathe')).toBeUndefined()
    expect(document.body.classList.contains('rest-guide')).toBe(false)
  })

  it('offers classic 4-7-8 only when at least 80 seconds remain', async () => {
    useStore.setState({ S: { ...useStore.getState().S, breathingExercise: 'extended-exhale' } })
    act(() => useUI.setState({ timer: rest(79) }))
    render()
    await click(button('Breathe'))
    expect(button('4-7-8')).toBeUndefined()

    act(() => useUI.setState({ timer: rest(80) }))
    render()
    expect(button('4-7-8')).toBeTruthy()
  })

  it('resumes at the current phase after the page was hidden without replaying missed haptics', async () => {
    act(() => useUI.setState({ timer: rest() }))
    render()
    await click(button('Breathe'))
    expect(host.querySelector('.breathing-phase').textContent).toContain('Inhale')

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => { vi.advanceTimersByTime(5000); await Promise.resolve() })
    expect(mocks.phaseBoundaryHaptic).not.toHaveBeenCalled()

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(host.querySelector('.breathing-phase').textContent).toContain('Exhale')
    expect(mocks.phaseBoundaryHaptic).not.toHaveBeenCalled()
  })

  it('plays one haptic for a visible phase boundary, but none on initial mount', async () => {
    act(() => useUI.setState({ timer: rest() }))
    render()
    await click(button('Breathe'))
    expect(mocks.phaseBoundaryHaptic).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(5500); await Promise.resolve() })

    expect(host.querySelector('.breathing-phase').textContent).toContain('Exhale')
    expect(mocks.phaseBoundaryHaptic).toHaveBeenCalledTimes(1)
  })

  it('suppresses phase haptics when disabled in settings', async () => {
    useStore.setState({ S: { ...useStore.getState().S, breathingHaptics: false } })
    act(() => useUI.setState({ timer: rest() }))
    render()
    await click(button('Breathe'))

    await act(async () => { vi.advanceTimersByTime(5500); await Promise.resolve() })

    expect(host.querySelector('.breathing-phase').textContent).toContain('Exhale')
    expect(mocks.phaseBoundaryHaptic).toHaveBeenCalledTimes(1)
    expect(mocks.phaseBoundaryHaptic).toHaveBeenCalledWith(false, expect.any(Function))
  })

  it('restarts from the beginning when the preferred exercise changes while open', async () => {
    act(() => useUI.setState({ timer: rest() }))
    render()
    await click(button('Breathe'))
    await act(async () => { vi.advanceTimersByTime(8000); await Promise.resolve() })
    expect(host.querySelector('.breathing-phase').textContent).toContain('Exhale')

    act(() => useStore.setState({ S: { ...useStore.getState().S, breathingExercise: 'bhramari' } }))

    expect(host.querySelector('.breathing-phase').textContent).toContain('Inhale')
    expect(host.querySelector('.breathing-phase').textContent).not.toContain('Hum')
  })
})
