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

async function renderWorkout(workout = snapshot) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'abc123', kind: 'workout', snapshot: workout }) })
  await act(async () => { root.render(<SharePage />) })
}

function mockReducedMotion(reduce) {
  const matchMedia = window.matchMedia.bind(window)
  vi.spyOn(window, 'matchMedia').mockImplementation(query => query === '(prefers-reduced-motion: reduce)' ? { matches: reduce } : matchMedia(query))
}

function statValue(label) {
  return [...host.querySelectorAll('.share-stat')].find(tile => tile.querySelector('.l').textContent === label).querySelector('.v').textContent
}

describe('public share page', () => {
  it('loads a public workout and renders its real body map, stats and media', async () => {
    mockReducedMotion(true)
    await renderWorkout()
    expect(host.textContent).toContain('Upper strength')
    expect(host.textContent).toContain('1,500')
    expect(host.textContent).toContain('Chest')
    expect(host.querySelector('.bodymap')).toBeTruthy()
    expect(host.querySelector('img[src="/gif/0025-video.gif"]')?.loading).toBe('lazy')
    expect(document.querySelector('meta[name="robots"]').content).toBe('noindex')
  })
  it('falls back from the GIF to the JPG, then shows the dumbbell without a broken image', async () => {
    mockReducedMotion(true)
    await renderWorkout()
    const tile = host.querySelector('.share-media')
    act(() => tile.querySelector('img').dispatchEvent(new Event('error')))
    expect(tile.querySelector('img')?.getAttribute('src')).toBe('/img/0025-image.jpg')
    act(() => tile.querySelector('img').dispatchEvent(new Event('error')))
    expect(tile.querySelector('img')).toBeNull()
    expect(tile.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('shows the dumbbell when the exercise has no media', async () => {
    mockReducedMotion(true)
    await renderWorkout({ ...snapshot, entries: [{ ...snapshot.entries[0], img: undefined, gif: undefined }] })
    const tile = host.querySelector('.share-media')
    expect(tile.querySelector('img')).toBeNull()
    expect(tile.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('starts the stats at zero and counts up when motion is allowed', async () => {
    mockReducedMotion(false)
    const frames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback))
    const advance = time => act(() => frames.splice(0).forEach(callback => callback(time)))
    await renderWorkout()
    expect(statValue('Volume')).toBe('0 kg')
    advance(10)
    advance(335)
    expect(statValue('Volume')).toBe('1,312.5 kg')
    advance(660)
    expect(statValue('Volume')).toBe('1,500 kg')
  })

  it('shows the final stats immediately with reduced motion and schedules no frames', async () => {
    mockReducedMotion(true)
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    await renderWorkout()
    expect(statValue('Volume')).toBe('1,500 kg')
    expect(requestFrame).not.toHaveBeenCalled()
  })

  it('explains a missing or revoked share', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) })
    await act(async () => { root.render(<SharePage />); await Promise.resolve() })
    expect(host.textContent).toContain('This share was removed or never existed')
  })
})
