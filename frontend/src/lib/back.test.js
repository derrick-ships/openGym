// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { decideBack, makeBackHandler, EXIT_WINDOW } from './back.js'

// Back on Android has to serve three layers with one event: the sheet stack on top, the
// page history under it, and — because a registered listener stops the plugin from ever
// finishing the activity itself — a deliberate way out of the app at the bottom.
describe('decideBack', () => {
  it('dismisses the top sheet before touching history', () => {
    expect(decideBack({ top: { id: 's1' }, canGoBack: true, exitArmed: false })).toBe('sheet')
  })

  it('lets a locked sheet swallow the press', () => {
    expect(decideBack({ top: { id: 's1', locked: true }, canGoBack: true, exitArmed: true })).toBe('ignore')
  })

  it('minimizes focus before history, but sheets take precedence', () => {
    expect(decideBack({ focusOpen: true, canGoBack: true, exitArmed: true })).toBe('minimize')
    expect(decideBack({ top: { id: 's1' }, focusOpen: true, canGoBack: true })).toBe('sheet')
    expect(decideBack({ top: { id: 's1', locked: true }, focusOpen: true })).toBe('ignore')
  })

  it('walks history when nothing is open', () => {
    expect(decideBack({ top: undefined, canGoBack: true, exitArmed: false })).toBe('history')
  })

  it('arms the exit at the bottom of the stack, and exits on the second press', () => {
    expect(decideBack({ top: undefined, canGoBack: false, exitArmed: false })).toBe('arm-exit')
    expect(decideBack({ top: undefined, canGoBack: false, exitArmed: true })).toBe('exit')
  })
})

function harness() {
  const calls = { closed: [], toasts: [], back: 0, exit: 0, minimized: 0 }
  let sheets = [], focusOpen = false
  let now = 1000
  const handler = makeBackHandler({
    getSheets: () => sheets,
    getFocusOpen: () => focusOpen,
    minimizeFocus: () => { calls.minimized++; focusOpen = false },
    closeSheet: id => { calls.closed.push(id); sheets = sheets.filter(s => s.id !== id) },
    toast: m => calls.toasts.push(m),
    goBack: () => { calls.back++ },
    exit: () => { calls.exit++ },
    now: () => now,
  })
  return { calls, handler, setSheets: s => { sheets = s }, setFocusOpen: v => { focusOpen = v }, tick: ms => { now += ms } }
}

describe('makeBackHandler', () => {
  it('minimizes an active focus timer before navigating or exiting', () => {
    const h = harness()
    h.setFocusOpen(true)
    expect(h.handler({ canGoBack: true })).toBe('minimize')
    expect(h.calls.minimized).toBe(1)
    expect(h.calls.back).toBe(0)
    expect(h.handler({ canGoBack: true })).toBe('history')
  })

  it('closes stacked sheets one press at a time', () => {
    const h = harness()
    h.setSheets([{ id: 'a' }, { id: 'b' }])
    expect(h.handler({ canGoBack: true })).toBe('sheet')
    expect(h.handler({ canGoBack: true })).toBe('sheet')
    expect(h.calls.closed).toEqual(['b', 'a'])
    expect(h.calls.back).toBe(0)
  })

  it('does not close a locked sheet, and does not arm the exit behind it', () => {
    const h = harness()
    h.setSheets([{ id: 'a', locked: true }])
    expect(h.handler({ canGoBack: false })).toBe('ignore')
    expect(h.calls.closed).toEqual([])
    expect(h.calls.toasts).toEqual([])
    expect(h.calls.exit).toBe(0)
  })

  it('goes back a page while the WebView still has app history', () => {
    const h = harness()
    expect(h.handler({ canGoBack: true })).toBe('history')
    expect(h.calls.back).toBe(1)
    expect(h.calls.exit).toBe(0)
  })

  // The whole point of the fix: one press at the root must never be the end of the app.
  it('warns once, then exits on a second press inside the window', () => {
    const h = harness()
    expect(h.handler({ canGoBack: false })).toBe('arm-exit')
    expect(h.calls.toasts).toHaveLength(1)
    expect(h.calls.exit).toBe(0)
    h.tick(EXIT_WINDOW - 1)
    expect(h.handler({ canGoBack: false })).toBe('exit')
    expect(h.calls.exit).toBe(1)
  })

  it('re-arms rather than exiting once the window has passed', () => {
    const h = harness()
    h.handler({ canGoBack: false })
    h.tick(EXIT_WINDOW + 1)
    expect(h.handler({ canGoBack: false })).toBe('arm-exit')
    expect(h.calls.exit).toBe(0)
    expect(h.calls.toasts).toHaveLength(2)
  })

  // A sheet opened (or a page pushed) after the warning means the user is still using the
  // app — the next back belongs to that sheet, and the one after must warn again.
  it('disarms the exit as soon as another press does real work', () => {
    const h = harness()
    h.handler({ canGoBack: false })
    h.setSheets([{ id: 'a' }])
    expect(h.handler({ canGoBack: true })).toBe('sheet')
    expect(h.handler({ canGoBack: false })).toBe('arm-exit')
    expect(h.calls.exit).toBe(0)
  })

  it('treats a missing event payload as no history', () => {
    const h = harness()
    expect(h.handler()).toBe('arm-exit')
  })
})
