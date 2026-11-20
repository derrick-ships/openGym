// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SharePage from './SharePage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const snapshot = { v: 1, kind: 'workout', title: 'Upper strength', date: '2026-11-19', unit: 'kg', accent: '#30d158', body: 'male', stats: { volume: 1500, sets: 9, workSets: 8, prs: 1, durationMs: 3600000 }, load: { chest: 4 }, entries: [{ id: '0025', name: 'barbell bench press', img: '0025-image.jpg', gif: '0025-video.gif', muscles: ['chest'], sets: [{ label: '50×8 kg', pr: true }] }], aiText: 'Session' }
let host, root
beforeEach(() => { history.replaceState({}, '', '/s/abc123'); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })
describe('public share page', () => {
  it('loads a public workout and renders its real body map, stats and media', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'abc123', kind: 'workout', snapshot }) })
    await act(async () => { root.render(<SharePage />); await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(host.textContent).toContain('Upper strength')
    expect(host.textContent).toContain('1,500')
    expect(host.textContent).toContain('Chest')
    expect(host.querySelector('.bodymap')).toBeTruthy()
    expect(host.querySelector('img[src="/gif/0025-video.gif"]')?.loading).toBe('lazy')
    expect(document.querySelector('meta[name="robots"]').content).toBe('noindex')
  })
  it('explains a missing or revoked share', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) })
    await act(async () => { root.render(<SharePage />); await Promise.resolve() })
    expect(host.textContent).toContain('This share was removed or never existed')
  })
})
