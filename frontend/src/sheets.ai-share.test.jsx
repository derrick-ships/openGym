// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { finishWorkout, workoutDetailSheet } from './sheets.jsx'

const mocks = vi.hoisted(() => ({ copy: vi.fn() }))
vi.mock('./lib/mobile.js', async importOriginal => ({ ...await importOriginal(), copyText: mocks.copy }))
vi.mock('./components/BodyMap.jsx', () => ({ default: () => null, bodyMapPngBlob: vi.fn() }))
vi.mock('./lib/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn(), unlock: vi.fn(), playOnSilentSupported: () => false }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host, open, clickAnchor, objectURL
const workout = () => ({ id: 'w1', d: '2026-11-19', start: Date.now() - 600000, name: 'Strength', entries: [{ id: '0009', target: { mode: 'reps' }, sets: [{ w: 20, r: 5, done: true }] }] })
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === text)
const renderTop = () => {
  const sheet = useUI.getState().sheets.at(-1)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
}
beforeEach(() => {
  localStorage.clear()
  useStore.setState({ S: { ...structuredClone(DEF), active: workout(), sound: false }, user: null })
  useUI.setState({ sheets: [], toastMsg: '' })
  mocks.copy.mockReset().mockResolvedValue(undefined)
  open = vi.spyOn(window, 'open').mockImplementation(() => null)
  clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { this.dataset.clicked = 'true' })
  objectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

describe('completed session AI handoff', () => {
  it('persists the selected context and includes it in the copied handoff', async () => {
    act(() => finishWorkout()); renderTop()
    expect(host.textContent).toContain('Make every session count')
    act(() => button('Sick').click())
    expect(useStore.getState().S.workouts[0].context).toEqual({ flags: ['sick'], note: '' })
    await act(async () => button('Track it in ChatGPT').click())
    expect(mocks.copy.mock.calls[0][0]).toContain('How it went: Sick')
    expect(open).toHaveBeenCalled()
  })
  it('saves a draft on blur, removes empty context, and flushes on unmount', () => {
    act(() => finishWorkout()); renderTop()
    const note = host.querySelector('input[aria-label="Anything else?"]')
    const type = value => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(note, value); note.dispatchEvent(new Event('input', { bubbles: true })) })
    type('elbow sore')
    expect(useStore.getState().S.workouts[0].context).toBeUndefined()
    act(() => note.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(useStore.getState().S.workouts[0].context.note).toBe('elbow sore')
    type('')
    act(() => note.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(useStore.getState().S.workouts[0].context).toBeUndefined()
    type('left early')
    act(() => root.render(null))
    expect(useStore.getState().S.workouts[0].context.note).toBe('left early')
  })
  it('disables editing and explains when the saved workout is missing', () => {
    act(() => finishWorkout()); renderTop()
    act(() => useStore.getState().update(s => { s.workouts = [] }))
    expect(button('Sick').disabled).toBe(true)
    expect(host.querySelector('input[aria-label="Anything else?"]').disabled).toBe(true)
    expect(host.textContent).toContain('This workout is no longer saved')
  })
  it('creates a hosted link for a signed-in session', async () => {
    useStore.setState({ user: { id: 'user1' } })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'abc123def456', url: '/s/abc123def456' }) })
    act(() => finishWorkout()); renderTop()
    await act(async () => button('Share link').click())
    renderTop()
    expect(host.querySelector('input[aria-label="Share link"]').value).toContain('/s/abc123def456')
    expect(button('Copy link')).toBeTruthy()
    expect(fetch.mock.calls[0][0]).toBe('/api/shares')
  })
  it('downloads a shareable HTML page and offers the same card in history', async () => {
    act(() => finishWorkout()); renderTop()
    await act(async () => button('Download page').click())
    expect(clickAnchor).toHaveBeenCalled()
    expect(clickAnchor.mock.instances[0].download).toMatch(/\.html$/)
    expect(objectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'text/html' }))
    act(() => workoutDetailSheet(useStore.getState().S.workouts[0])); renderTop()
    expect(host.textContent).toContain('Make every session count')
  })
})
