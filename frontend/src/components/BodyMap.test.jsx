// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import BodyMap, { BodyMapLegend, bodyMapPngBlob, bodyMapSvg } from './BodyMap.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// BodyMap fetches its ~90 KB of geometry with a dynamic import on first render, and the
// waitFor below allows one second for it. That is ample once the module is in the ESM
// registry and not always ample when it is not: on a loaded CI runner the first map render
// in this file paid the cold import and timed out, while every later test passed on the
// component's warm CACHE. Import it here so the wait covers rendering, not module loading,
// and the file stops depending on how fast the machine is.
beforeAll(() => import('../lib/body-paths.js'))

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function renderMap(props = {}) {
  await act(async () => {
    root.render(<BodyMap load={{ chest: 2 }} {...props} />)
  })
  await vi.waitFor(() => expect(container.querySelectorAll('.bm-v')).toHaveLength(2))
  return container.querySelector('.bm-m[aria-label="Chest"]')
}

describe('BodyMap interaction semantics', () => {
  it('keeps noninteractive maps as images without focusable muscle controls', async () => {
    await renderMap()
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(2)
    expect(container.querySelector('[role="button"]')).toBeNull()
  })

  it('exposes interactive muscles as translated pressed buttons inside groups', async () => {
    const path = await renderMap({ selected: 'chest', onMuscle: vi.fn() })
    expect(container.querySelectorAll('svg[role="group"]')).toHaveLength(2)
    expect(path).toBeTruthy()
    expect(path.tabIndex).toBe(0)
    expect(path.getAttribute('aria-pressed')).toBe('true')
  })

  it.each(['Enter', ' '])('activates a muscle once with %s', async key => {
    const onMuscle = vi.fn()
    const path = await renderMap({ onMuscle })
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })

    act(() => path.dispatchEvent(event))

    expect(onMuscle).toHaveBeenCalledTimes(1)
    expect(onMuscle).toHaveBeenCalledWith('chest')
    expect(event.defaultPrevented).toBe(key === ' ')
  })

  it('labels the existing legend direction for assistive technology', () => {
    act(() => root.render(<BodyMapLegend />))
    expect(container.querySelector('.hm-legend').getAttribute('aria-label')).toBe('Less More')
  })

  it('exports both rendered views with the title and every affected muscle label', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <svg class="bm-v" viewBox="0 0 10 20"><path class="bm-sil" d="M0 0h1v1z"></path><path class="bm-m l4" d="M1 1h1v1z"></path></svg>
      <svg class="bm-v" viewBox="0 0 10 20"><path class="bm-sil" d="M0 0h1v1z"></path><path class="bm-m l2" d="M1 1h1v1z"></path></svg>`
    document.body.appendChild(host)

    const output = bodyMapSvg(host, { title: 'Leg day', labels: ['Quads', 'Hamstrings', 'Glutes'] })

    expect(output).toContain('<title>Leg day</title>')
    expect(output).toContain('Front')
    expect(output).toContain('Back')
    expect(output).toContain('Quads')
    expect(output).toContain('Hamstrings')
    expect(output).toContain('Glutes')
    expect(output).toContain('viewBox="0 0 10 20"')
    expect(output).toContain('fill=')
    host.remove()
  })

  it('fails closed until both body views have rendered', () => {
    const host = document.createElement('div')
    host.innerHTML = '<svg class="bm-v" viewBox="0 0 10 20"></svg>'
    expect(() => bodyMapSvg(host, { title: 'Incomplete' })).toThrow(/two body views/i)
  })

  it('rasterizes the rendered map into a non-empty PNG blob', async () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <svg class="bm-v" viewBox="0 0 10 20"><path class="bm-sil" d="M0 0h1v1z"></path><path class="bm-m l4" d="M1 1h1v1z"></path></svg>
      <svg class="bm-v" viewBox="0 0 10 20"><path class="bm-sil" d="M0 0h1v1z"></path><path class="bm-m l2" d="M1 1h1v1z"></path></svg>`
    document.body.appendChild(host)
    const OriginalImage = globalThis.Image
    const originalCreateElement = document.createElement.bind(document)
    class FakeImage {
      set src(value) { this._src = value; queueMicrotask(() => this.onload?.()) }
      get src() { return this._src }
    }
    const context = { drawImage: vi.fn() }
    const canvas = {
      width: 0, height: 0,
      getContext: () => context,
      toBlob: callback => callback(new Blob(['png-bytes'], { type: 'image/png' })),
    }
    globalThis.Image = FakeImage
    const createElement = vi.spyOn(document, 'createElement').mockImplementation(tag => tag === 'canvas' ? canvas : originalCreateElement(tag))

    const blob = await bodyMapPngBlob(host, { title: 'Leg day', labels: ['Quads'] })
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(0)

    createElement.mockRestore()
    globalThis.Image = OriginalImage
    host.remove()
  })
})
