import { useState } from 'react'
import { t } from '../lib/i18n.js'
import * as handoff from '../lib/ai-handoff.js'
import { copyText } from '../lib/mobile.js'
import { OpenAIMark, ClaudeMark } from './BrandIcons.jsx'

export function AiButtons({ getText, getLinkText, kind = 'session', onCopied, notify }) {
  const [message, setMessage] = useState('')
  const say = text => { if (notify) notify(text); else setMessage(text) }
  const share = id => {
    const fullText = getText()
    const linkText = getLinkText ? getLinkText(id, fullText) : fullText
    const text = handoff.providerPrompt(id, fullText)
    const prompt = linkText ? handoff.providerPrompt(id, linkText) : ''
    const provider = handoff.AI_PROVIDERS[id]
    const fits = handoff.deepLinkFits(id, prompt)
    let copied
    try { copied = copyText(text) } catch { copied = Promise.reject(new Error('clipboard unavailable')) }
    try { window.open(handoff.aiDeepLink(id, prompt, { kind }), '_blank', 'noopener') } catch { /* clipboard remains available */ }
    Promise.resolve(copied).then(() => {
      say(fits || kind === 'share' ? t('Opening {0}…', provider.name) : t('Copied. Paste it in {0} after it opens.', provider.name))
      onCopied?.()
    }).catch(() => say(kind === 'share' ? t('Opening {0}…', provider.name) : t('Could not copy. Please try again.')))
  }
  return <><div className="ai-buttons">
    <button type="button" className="ai-button ai-chat" onClick={() => share('chatgpt')}><OpenAIMark /><span>{t('Track it in ChatGPT')}</span></button>
    <button type="button" className="ai-button ai-claude" onClick={() => share('claude')}><ClaudeMark /><span>{t('Review it with Claude')}</span></button>
  </div>{!notify && message && <p className="small muted" role="status">{message}</p>}</>
}
