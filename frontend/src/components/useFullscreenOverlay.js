import { useLayoutEffect } from 'react'
import { useUI } from '../store/useUI.js'

// Shared by mutually exclusive work and rest overlays; sheets remain interactive above both.
export function useFullscreenOverlay(open, overlayRef, initialFocusRef, minimize) {
  useLayoutEffect(() => {
    if (!open || !overlayRef.current) return
    const overlay = overlayRef.current
    const previous = document.activeElement
    const page = document.documentElement
    const scrollY = window.scrollY
    page.style.setProperty('--focus-scroll-offset', `${-scrollY}px`)
    page.classList.add('focus-timer-open')
    useUI.setState({ focusOpen: true, minimizeFocus: minimize })
    const siblings = [...overlay.parentElement.children].filter(element => element !== overlay && element.id !== 'modal-root' && element.id !== 'toast' && !element.matches('.focus-timer, .breathing-focus'))
    const wasInert = siblings.map(element => element.inert)
    siblings.forEach(element => { element.inert = true })
    initialFocusRef.current?.focus()
    const onKey = event => {
      if (useUI.getState().sheets?.length) return
      if (event.key === 'Escape') { event.preventDefault(); minimize() }
      if (event.key === 'Tab') {
        const buttons = [...overlay.querySelectorAll('button:not([disabled])')]
        const index = buttons.indexOf(document.activeElement)
        if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index === -1 || index === buttons.length - 1))) {
          event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      page.classList.remove('focus-timer-open')
      page.style.removeProperty('--focus-scroll-offset')
      window.scrollTo(0, scrollY)
      useUI.setState({ focusOpen: false, minimizeFocus: null })
      siblings.forEach((element, index) => { element.inert = wasInert[index] })
      if (previous?.isConnected) previous.focus()
    }
  }, [open, overlayRef, initialFocusRef, minimize])
}
