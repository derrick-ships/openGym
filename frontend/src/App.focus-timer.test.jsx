// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { useUI } from './store/useUI.js'

const mocked = vi.hoisted(() => {
  const ui = {
    timer: null, work: { left: 45, total: 45, endsAt: 123456, label: 'Plank' }, sheets: [],
    addRest: vi.fn(), stopRest: vi.fn(), finishWorkEarly: vi.fn(), stopWork: vi.fn(),
  }
  return { ui, store: { S: { focusTimer: true, theme: 'dark', accent: 'lime' }, ready: true, user: null, needsMobileOnboarding: false, isGuest: () => true, boot: vi.fn() } }
})
vi.mock('./store/useStore.js', () => ({ useStore: selector => selector ? selector(mocked.store) : mocked.store }))
vi.mock('./store/useUI.js', () => {
  const useUI = selector => selector ? selector(mocked.ui) : mocked.ui
  useUI.getState = () => mocked.ui
  useUI.setState = value => Object.assign(mocked.ui, value)
  return { useUI }
})
vi.mock('./components/ui.jsx', () => ({ bindUI: vi.fn(), Button: ({ children, ...props }) => <button {...props}>{children}</button> }))
vi.mock('./components/BreathingGuide.jsx', () => ({ default: () => null }))
vi.mock('./lib/format.js', () => ({ ACCENTS: { lime: true } }))
vi.mock('./lib/i18n.js', () => ({ t: value => value, setLang: vi.fn(), useLang: () => 0 }))
vi.mock('./lib/sound.js', () => ({ setPlayOnSilent: vi.fn() }))
vi.mock('./lib/nav.js', () => ({ setNav: vi.fn() }))
vi.mock('./lib/back.js', () => ({ initBackButton: vi.fn(() => Promise.resolve(() => {})) }))
vi.mock('./lib/wakelock.js', () => ({ useWakeLock: vi.fn() }))
vi.mock('./lib/viewport-guard.js', () => ({ installViewportGuard: vi.fn(() => () => {}) }))
vi.mock('./lib/hchips.js', () => ({ installChipDrag: vi.fn(() => () => {}) }))
vi.mock('./lib/push.js', () => ({ syncPushSubscription: vi.fn() }))
vi.mock('./lib/mobile.js', () => ({ MOBILE: false }))
vi.mock('./sheets.jsx', () => ({ startFlow: vi.fn() }))
vi.mock('./components/Icon.jsx', () => ({ default: () => null }))
vi.mock('./components/TabBar.jsx', () => ({ default: () => null }))
vi.mock('./components/ErrorBoundary.jsx', () => ({ default: ({ children }) => children }))
vi.mock('./components/Modals.jsx', () => ({ default: () => null }))
vi.mock('./components/Toast.jsx', () => ({ default: () => null }))
vi.mock('./components/SyncBanner.jsx', () => ({ default: () => null }))
vi.mock('./components/TimerFlash.jsx', () => ({ default: () => null }))
vi.mock('./views/Login.jsx', () => ({ default: () => null }))
vi.mock('./views/MobileOnboarding.jsx', () => ({ default: () => null }))
vi.mock('./views/Home.jsx', () => ({ default: () => null }))
vi.mock('./views/CheckIn.jsx', () => ({ default: () => null }))
vi.mock('./views/Plan.jsx', () => ({ default: () => null }))
vi.mock('./views/RoutineEdit.jsx', () => ({ default: () => null }))
vi.mock('./views/Workout.jsx', () => ({ default: () => null }))
vi.mock('./views/Stats.jsx', () => ({ default: () => null }))
vi.mock('./views/History.jsx', () => ({ default: () => null }))
vi.mock('./views/Library.jsx', () => ({ default: () => null }))
vi.mock('./views/Stretching.jsx', () => ({ default: () => null }))
vi.mock('./views/Muscles.jsx', () => ({ default: () => null }))
vi.mock('./views/Settings.jsx', () => ({ default: () => null }))
vi.mock('./views/Admin.jsx', () => ({ default: () => null }))
vi.mock('./views/CoachChat.jsx', () => ({ default: () => null }))
vi.mock('./views/CoachIntake.jsx', () => ({ default: () => null }))
vi.mock('./views/CoachSetup.jsx', () => ({ default: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); document.body.classList.remove('resting'); history.replaceState(null, '', '/') })

describe('App work timer', () => {
  it('mounts one focus overlay beside the work bar', async () => {
    history.replaceState(null, '', '/#/workout')
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    await act(async () => { root.render(<App />); await Promise.resolve() })
    expect(host.querySelectorAll('#timer.working')).toHaveLength(1)
    expect(host.querySelectorAll('.focus-timer')).toHaveLength(1)
    expect(host.querySelector('.focus-timer-clock').textContent).toBe('0:45')
  })
})
