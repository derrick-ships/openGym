import { t } from '../lib/i18n.js'
import * as handoff from '../lib/ai-handoff.js'
import { copyText } from '../lib/mobile.js'
import { useUI } from '../store/useUI.js'

function ChatGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.2c2.5-1 5.1.5 5.3 3.1 2.8.3 3.9 3.1 2.3 5.1 1.4 2.3.1 5-2.5 5.1-.6 2.7-3.4 3.5-5.1 1.7-2.3 1.4-5 .2-5.1-2.4-2.7-.6-3.5-3.3-1.7-5.1C3.9 8.3 5.2 5.7 7.8 5.7c.6-2.5 3.1-3.5 4.2-2.5Z" />
    <path d="m8.3 9.5 3.7-2.1 3.7 2.1v4.3L12 16l-3.7-2.2z" />
  </svg>
}
function ClaudeGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7M8.3 3.2l7.4 17.6M20.8 8.3 3.2 15.7M15.7 3.2 8.3 20.8M3.2 8.3l17.6 7.4" />
  </svg>
}

export function AiShareButtons({ getText, onCopied }) {
  const toast = useUI(s => s.toast)
  const share = id => {
    const text = getText()
    const provider = handoff.AI_PROVIDERS[id]
    const fits = typeof handoff.deepLinkFits === 'function' && handoff.deepLinkFits(id, text)
    let copied
    try { copied = copyText(text) } catch { copied = Promise.reject(new Error('clipboard unavailable')) }
    // Both calls start inside the user gesture: waiting on the clipboard can make browsers block the new tab.
    try { window.open(handoff.aiDeepLink(id, text), '_blank', 'noopener') } catch { /* clipboard remains available */ }
    Promise.resolve(copied).then(() => {
      toast(fits ? t('Opening {0}…', provider.name) : t('Copied. Paste it in {0}.', provider.name))
      onCopied?.()
    }).catch(() => toast(t('Could not copy. Please try again.')))
  }
  return <div className="ai-buttons">
    <button type="button" className="ai-button ai-chat" onClick={() => share('chatgpt')}><ChatGlyph /><span>{t('Share with ChatGPT')}</span></button>
    <button type="button" className="ai-button ai-claude" onClick={() => share('claude')}><ClaudeGlyph /><span>{t('Claude')}</span></button>
  </div>
}
