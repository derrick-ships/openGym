import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE, copyText, shareText } from '../lib/mobile.js'
import { createShare } from '../lib/share-snapshot.js'
import { isShareCancellation } from '../lib/share-html.js'
import { Button } from './ui.jsx'

function LinkSheet({ url }) {
  const toast = useUI(s => s.toast)
  const copy = async () => {
    try { await copyText(url); toast(t('Link copied')) }
    catch { toast(t('Could not copy. Please try again.')) }
  }
  const share = async () => {
    try { await shareText('openGym', url) }
    catch (error) { if (!isShareCancellation(error)) toast(t('Could not share the page.')) }
  }
  return <div className="share-link-sheet"><h3>{t('Share link')}</h3>
    <p className="muted small">{t('Anyone with this link can view this page.')}</p>
    <input className="input" aria-label={t('Share link')} readOnly value={url} onFocus={event => event.target.select()} />
    <Button variant="primary" icon="clipboard" onClick={copy}>{t('Copy link')}</Button>
    {(MOBILE || navigator.share) && <Button icon="upload" onClick={share}>{t('Share')}</Button>}
    <a className="btn ghost" href={url} target="_blank" rel="noopener noreferrer">{t('Open page')}</a>
  </div>
}

export default function ShareLink({ kind, snapshot, download }) {
  const user = useStore(s => s.user)
  const guest = useStore(s => s.isGuest?.() || false)
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(false)
  const hosted = !!user && !guest && !MOBILE
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (!hosted) await download()
      else {
        const result = await createShare(kind, snapshot())
        const url = new URL(result.url, location.origin).href
        useUI.getState().openSheet(() => <LinkSheet url={url} />)
      }
    } catch (error) {
      if (!isShareCancellation(error)) toast(t('Could not share the page.'))
    } finally { setBusy(false) }
  }
  return <><Button variant="ghost" icon={hosted ? 'upload' : 'download'} disabled={busy} onClick={run}>{hosted ? t('Share link') : t('Download page')}</Button>
    {!hosted && <p className="muted small share-fallback">{t('Sign in to a server to create a share link.')}</p>}</>
}
