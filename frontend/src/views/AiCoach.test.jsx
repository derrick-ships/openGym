// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import RoutineEdit from './RoutineEdit.jsx'
import { DEF, useStore } from '../store/useStore.js'

const mocks = vi.hoisted(() => ({ copy: vi.fn() }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...await importOriginal(), copyText: mocks.copy }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null, bodyMapPngBlob: vi.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const mount = node => act(() => root.render(<MemoryRouter initialEntries={['/routine/r1']}><Routes><Route path="/routine/:id" element={node} /></Routes></MemoryRouter>))
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === text)
const type = (el, value) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) }
beforeEach(() => {
  localStorage.clear()
  const S = structuredClone(DEF)
  S.routines = [{ id: 'r1', name: 'Strength', emoji: 'dumbbell', ex: [] }]
  useStore.setState({ S, user: null })
  mocks.copy.mockReset().mockResolvedValue(undefined)
  vi.spyOn(window, 'open').mockImplementation(() => null)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); delete navigator.canShare; delete navigator.share; vi.restoreAllMocks() })

describe('AI coach and routine page', () => {
  it('stores profile edits and copies coach instructions with the profile', async () => {
    mount(<Settings />)
    expect(host.textContent).toContain('AI coach')
    const birth = host.querySelector('[aria-label="Birth year"]')
    act(() => type(birth, '1990'))
    expect(useStore.getState().S.athlete.birthYear).toBeNull()
    act(() => birth.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(useStore.getState().S.athlete.birthYear).toBe(1990)
    await act(async () => button('Copy coach instructions').click())
    expect(mocks.copy.mock.calls[0][0]).toContain('My profile')
  })
  it('validates birth year and metric height on blur and Enter', () => {
    mount(<Settings />)
    const birth = host.querySelector('[aria-label="Birth year"]')
    const height = host.querySelector('[aria-label="Height (cm)"]')
    const blur = el => act(() => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    act(() => type(birth, '1899')); blur(birth)
    expect(useStore.getState().S.athlete.birthYear).toBeNull()
    act(() => type(birth, '199')); blur(birth)
    expect(useStore.getState().S.athlete.birthYear).toBeNull()
    act(() => type(birth, '1995'))
    act(() => birth.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(useStore.getState().S.athlete.birthYear).toBe(1995)
    act(() => type(height, '49')); blur(height)
    expect(useStore.getState().S.athlete.heightCm).toBeNull()
    act(() => type(height, '273')); blur(height)
    expect(useStore.getState().S.athlete.heightCm).toBeNull()
    act(() => type(height, '170.5'))
    expect(useStore.getState().S.athlete.heightCm).toBeNull()
    blur(height)
    expect(useStore.getState().S.athlete.heightCm).toBe(170.5)
  })
  it('keeps a previously saved beginner experience visible', () => {
    useStore.getState().update(s => { s.athlete.experience = 'New' })
    mount(<Settings />)
    expect(host.querySelector('[aria-label="Experience"]').value).toBe('New to lifting')
  })
  it('preserves typed spacing in profile notes', () => {
    mount(<Settings />)
    const input = [...host.querySelectorAll('.ai-profile textarea')][0]
    act(() => type(input, 'sore '))
    expect(input.value).toBe('sore ')
    act(() => type(input, 'sore elbow'))
    expect(useStore.getState().S.athlete.injuries).toBe('sore elbow')
  })
  it('edits an imperial height digit by digit without losing the draft', () => {
    useStore.getState().update(s => { s.unit = 'lb' })
    mount(<Settings />)
    const feet = host.querySelector('[aria-label="Height (ft)"]')
    const inches = host.querySelector('[aria-label="Height (in)"]')
    act(() => type(feet, '5'))
    act(() => type(inches, '1'))
    act(() => type(inches, '10'))
    expect(useStore.getState().S.athlete.heightCm).toBe(177.8)
    expect(inches.value).toBe('10')
  })
  it('does not report a canceled native share as an error', async () => {
    const toast = vi.fn()
    useStore.getState().S.routines[0].name = 'Strength'
    const ui = await import('../store/useUI.js')
    ui.useUI.setState({ toast })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(new Error('Share canceled')) })
    mount(<RoutineEdit />)
    await act(async () => button('Share as page').click())
    expect(toast).not.toHaveBeenCalled()
    delete navigator.canShare; delete navigator.share
  })
  it('downloads a routine as an HTML page', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mount(<RoutineEdit />)
    await act(async () => button('Share as page').click())
    expect(click).toHaveBeenCalled()
    expect(click.mock.instances[0].download).toMatch(/\.html$/)
    await act(async () => button('Share with ChatGPT').click())
    expect(mocks.copy.mock.calls[0][0]).toContain('Strength')
  })
})
