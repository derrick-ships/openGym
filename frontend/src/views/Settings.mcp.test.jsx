// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALL_SCOPES = [
  'exercise:read', 'routine:read', 'workout:read', 'bodyweight:read', 'progress:read',
  'workout:write', 'routine:propose', 'routine:write', 'exercise:write', 'image:write',
  'equipment:read', 'equipment:write', 'plan:write',
]

const mocks = vi.hoisted(() => {
  const state = { S: null, user: { uid: 'u1', name: 'Derrick' }, api: vi.fn(), toast: vi.fn() }
  state.snapshot = () => ({
    S: state.S, user: state.user, coachLocal: null,
    update: vi.fn(), replaceState: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(),
    adoptProfile: vi.fn(), signOut: vi.fn(), signOutAll: vi.fn(), resetDemo: vi.fn(), disconnectServer: vi.fn(),
  })
  return state
})

vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' } }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...args) => mocks.toast(...args), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/api.js', () => ({
  api: (...args) => mocks.api(...args), webauthnOK: () => false,
  passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false,
}))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), syncReminder: vi.fn() }))
vi.mock('../lib/update.js', () => ({ checkForUpdate: vi.fn(), downloadAndInstall: vi.fn() }))
vi.mock('../lib/coach-api.js', () => ({ forgetCoach: vi.fn() }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(), importFromHevy: vi.fn(),
  equipmentProfileSheet: vi.fn(), menuSheet: vi.fn(), askAddDeviceData: vi.fn(),
}))

globalThis.__APP_VERSION__ ??= 'test'

let host, root
const config = (extra = {}) => ({
  enabled: true,
  url: 'https://gym.example.test/mcp',
  proposals_enabled: false,
  images_enabled: true,
  scopes: ALL_SCOPES,
  ...extra,
})

beforeEach(() => {
  mocks.S = { unit: 'kg', restSec: 90, restPauseSec: 15, sound: false, effort: 'none', gifSize: 'full', workouts: [], routines: [], exWeights: {} }
  mocks.api.mockReset()
  mocks.toast.mockReset()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(() => Promise.resolve()) } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const mount = async () => { await act(async () => root.render(<Settings />)); await flush() }
const mcp = () => [...host.querySelectorAll('.sect')].find(s => s.querySelector('.sect-t')?.textContent === 'Remote MCP access')
const button = (label, parent = mcp()) => [...parent.querySelectorAll('button')].find(b => b.textContent.trim() === label || b.getAttribute('aria-label') === label)
const chip = label => [...mcp().querySelectorAll('.chip')].find(b => b.textContent.trim() === label)

describe('Settings — remote MCP access', () => {
  it('filters proposal and image scopes when their server features are disabled, including defaults', async () => {
    mocks.api.mockImplementation((path, opts) => {
      if (path === '/api/config') return Promise.resolve({ mcp: config({ proposals_enabled: false, images_enabled: false }) })
      if (path === '/api/mcp/grants' && !opts) return Promise.resolve({ grants: [] })
      if (path === '/api/mcp/grants' && opts?.method === 'POST') return Promise.resolve({ token: 'token' })
      throw new Error('disabled proposals must not be requested')
    })

    await mount()
    expect(chip('Routine proposals')).toBeUndefined()
    expect(chip('Exercise images')).toBeUndefined()
    await act(async () => { button('Create grant').click(); await Promise.resolve() })
    const request = mocks.api.mock.calls.find(([path, opts]) => path === '/api/mcp/grants' && opts?.method === 'POST')
    expect(JSON.parse(request[1].body).scopes).not.toEqual(expect.arrayContaining(['routine:propose', 'image:write']))
  })

  it('shows the copyable server URL and write scopes while proposals stay independently disabled', async () => {
    mocks.api.mockImplementation(path => {
      if (path === '/api/config') return Promise.resolve({ mcp: config() })
      if (path === '/api/mcp/grants') return Promise.resolve({ grants: [{ id: 'g1', name: 'Claude', scopes: ['exercise:read'] }] })
      throw new Error('proposals endpoint must not be requested when disabled')
    })

    await mount()

    expect(mcp().querySelector('input[readonly]').value).toBe('https://gym.example.test/mcp')
    expect(mcp().textContent).toContain('Create and edit routines')
    expect(mcp().textContent).toContain('Create and edit exercises')
    expect(mcp().textContent).toContain('Exercise images')
    expect(mcp().textContent).toContain('Plan the week')
    expect(mcp().textContent).toContain('Claude')
    expect(mocks.api.mock.calls.some(([path]) => path === '/api/mcp/proposals')).toBe(false)
  })

  it('creates a grant and offers a one-time token copy action without putting it in a URL', async () => {
    mocks.api.mockImplementation((path, opts) => {
      if (path === '/api/config') return Promise.resolve({ mcp: config({ proposals_enabled: true }) })
      if (path === '/api/mcp/grants' && !opts) return Promise.resolve({ grants: [] })
      if (path === '/api/mcp/proposals') return Promise.resolve({ proposals: [], revision: '"1"' })
      if (path === '/api/mcp/grants' && opts?.method === 'POST') return Promise.resolve({ token: 'secret-token' })
      throw new Error('unexpected API call')
    })

    await mount()
    const create = button('Create grant')
    await act(async () => { create.click(); await Promise.resolve() })

    expect(mcp().textContent).toContain('secret-token')
    expect(mcp().querySelector('input[readonly]').value).not.toContain('secret-token')
    expect(mcp().querySelector('[role="status"][aria-live="polite"]')).toBeTruthy()
    const copyToken = button('Copy token')
    await act(async () => { copyToken.click(); await Promise.resolve() })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-token')
  })

  it('keeps the URL selectable and reports clipboard failure', async () => {
    mocks.api.mockImplementation(path => {
      if (path === '/api/config') return Promise.resolve({ mcp: config() })
      if (path === '/api/mcp/grants') return Promise.resolve({ grants: [] })
      throw new Error('proposals endpoint must not be requested when disabled')
    })
    navigator.clipboard.writeText.mockRejectedValue(new Error('blocked'))

    await mount()
    await act(async () => { button('Copy URL').click(); await Promise.resolve() })

    expect(mcp().querySelector('input[readonly]')).toBeTruthy()
    expect(mcp().textContent).toContain('Copy failed — select the URL manually')
  })

  it('shows disabled and loading errors instead of presenting a dead create form', async () => {
    mocks.api.mockImplementation(path => path === '/api/config' ? Promise.resolve({ mcp: config({ enabled: false }) }) : Promise.reject(new Error('must not load')))
    await mount()
    expect(mcp().textContent).toContain('MCP access is disabled on this server.')
    expect(button('Create grant')).toBeUndefined()
    expect(mocks.api).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
    root = createRoot(host)
    mocks.api.mockReset()
    mocks.api.mockRejectedValue(new Error('offline'))
    await act(async () => root.render(<Settings />))
    await flush()
    expect(mcp().textContent).toContain('Could not load remote MCP access.')
  })

  it('disables create while a grant request is pending so repeated taps issue one request', async () => {
    let resolveCreate
    const pending = new Promise(resolve => { resolveCreate = resolve })
    mocks.api.mockImplementation((path, opts) => {
      if (path === '/api/config') return Promise.resolve({ mcp: config() })
      if (path === '/api/mcp/grants' && !opts) return Promise.resolve({ grants: [] })
      if (path === '/api/mcp/grants' && opts?.method === 'POST') return pending
      throw new Error('proposals endpoint must not be requested when disabled')
    })

    await mount()
    await act(async () => { button('Create grant').click(); button('Create grant').click(); await Promise.resolve() })
    expect(mocks.api.mock.calls.filter(([path, opts]) => path === '/api/mcp/grants' && opts?.method === 'POST')).toHaveLength(1)
    expect(button('Create grant').disabled).toBe(true)
    await act(async () => { resolveCreate({ token: 'pending-token' }); await pending; await Promise.resolve() })
  })

  it('disables revoke while a revoke request is pending so repeated taps issue one request', async () => {
    let resolveRevoke
    const pending = new Promise(resolve => { resolveRevoke = resolve })
    mocks.api.mockImplementation((path, opts) => {
      if (path === '/api/config') return Promise.resolve({ mcp: config() })
      if (path === '/api/mcp/grants' && !opts) return Promise.resolve({ grants: [{ id: 'g1', name: 'Claude', scopes: ['exercise:read'] }] })
      if (path === '/api/mcp/grants/revoke') return pending
      throw new Error('proposals endpoint must not be requested when disabled')
    })

    await mount()
    await act(async () => { button('Revoke').click(); button('Revoke').click(); await Promise.resolve() })
    expect(mocks.api.mock.calls.filter(([path]) => path === '/api/mcp/grants/revoke')).toHaveLength(1)
    expect(button('Revoke').disabled).toBe(true)
    await act(async () => { resolveRevoke({ ok: true }); await pending; await Promise.resolve() })
  })
})
