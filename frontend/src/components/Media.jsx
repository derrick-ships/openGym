import { useEffect, useRef, useState } from 'react'
import { imgSrc, gifSrc } from '../lib/exercises.js'
import { assetObjectUrl } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { glyphOf, GLYPHS } from '../lib/glyphs.js'

function exerciseThumbGlyph(value) {
  const glyph = value && glyphOf(value)
  return glyph && GLYPHS.includes(glyph) ? glyph : 'dumbbell'
}

function usePrivateAsset(ex) {
  const id = ex?.media?.id || null
  const remoteBase = globalThis.__opengymRemoteBase || ''
  const remoteVersion = globalThis.__opengymRemoteAssetVersion || 0
  const [src, setSrc] = useState(() => id && !remoteBase ? imgSrc(ex) : null)
  useEffect(() => {
    let alive = true
    if (!id) { setSrc(null); return () => { alive = false } }
    setSrc(remoteBase ? null : imgSrc(ex))
    assetObjectUrl(id).then(url => { if (alive) setSrc(url) }).catch(() => { if (alive) setSrc(null) })
    return () => { alive = false }
  }, [id, ex?.media?.sha256, remoteBase, remoteVersion])
  return src
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    try { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches }
    catch { return false }
  })
  useEffect(() => {
    let query
    try { query = window.matchMedia('(prefers-reduced-motion: reduce)') } catch { return undefined }
    const onChange = event => setReduced(event.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

// Big autoplaying animation; tap toggles to the still frame. `compact` shrinks it (superset cards).
// Custom exercise images are private API assets; animated assets are delivered as animated WebP.
// `minimizable` (workout view) adds a persistent minimize/expand control so the animation stops
// eating the screen; the chosen size is saved to settings and carries across exercises and
// future workouts (issue #12). Settings can also turn workout media off entirely
// (gifSize 'off') — then nothing renders here and the exercise card closes up, exactly like
// a custom exercise without media. Any other/legacy value behaves as 'full'.
export default function Media({ ex, id, compact, minimizable }) {
  const reducedMotion = usePrefersReducedMotion()
  const [playing, setPlaying] = useState(() => !reducedMotion)
  const [pausedFrame, setPausedFrame] = useState(null)
  const [snapshotError, setSnapshotError] = useState(false)
  const imageRef = useRef(null)
  // 'gif' → the animation failed, the still is showing; 'all' → the still failed too. Media is
  // fetched from wherever the build points (a mount, a CDN): a dropped connection, an expired
  // session on a gated instance or a CDN hiccup used to leave the browser's broken-image glyph
  // on a white block. Now the still stands in for the animation, a neutral tile stands in for
  // both, and a tap tries again — no text, so nothing new to translate.
  const [failed, setFailed] = useState(null)
  const gifSize = useStore(s => s.S.gifSize)
  const update = useStore(s => s.update)
  const privateSrc = usePrivateAsset(ex)
  useEffect(() => {
    setFailed(null)
    setPausedFrame(null)
    setSnapshotError(false)
    setPlaying(!reducedMotion)
  }, [ex.id, ex.media?.id, ex.media?.sha256, reducedMotion])
  if (!ex.gif && !ex.media?.id) return null
  if (minimizable && gifSize === 'off') return null
  if (ex.media?.id && !privateSrc) return <div className={'exmedia' + (compact ? ' compact' : '')} id={id} aria-busy="true" />
  const canAnimate = Boolean(ex.gif || ex.media?.animated === true || ex.media?.mime === 'image/gif')
  const privateAnimated = Boolean(ex.media?.id && (ex.media?.animated === true || ex.media?.mime === 'image/gif'))
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }
  const captureFrame = () => {
    const image = imageRef.current
    if (!image) { setSnapshotError(true); return false }
    try {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!width || !height) { setSnapshotError(true); return false }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) { setSnapshotError(true); return false }
      context.drawImage(image, 0, 0, width, height)
      const frame = canvas.toDataURL('image/png')
      if (!frame || frame === 'data:,') { setSnapshotError(true); return false }
      setSnapshotError(false)
      setPausedFrame(frame)
      return true
    } catch {
      setSnapshotError(true)
      return false
    }
  }
  const togglePlayback = e => {
    e?.stopPropagation()
    if (!canAnimate) return
    if (!playing) {
      setPausedFrame(null)
      setSnapshotError(false)
      setPlaying(true)
      return
    }
    if (privateAnimated && !captureFrame()) return
    setPlaying(false)
  }
  const showGif = canAnimate && playing && failed == null
  const displaySrc = ex.media?.id
    ? (privateAnimated && !playing ? (pausedFrame || privateSrc) : privateSrc)
    : (showGif ? gifSrc(ex) : imgSrc(ex))
  const onImageLoad = () => {
    if (privateAnimated && !playing && !pausedFrame && !captureFrame() && reducedMotion) setFailed('all')
  }
  const onError = () => setFailed(ex.media?.id ? 'all' : showGif ? 'gif' : 'all')
  const onTap = () => {
    if (failed) { setFailed(null); setPlaying(!reducedMotion); return }
    togglePlayback()
  }
  return (
    <div className={'exmedia' + (compact ? ' compact' : '') + (mini ? ' mini' : '') + (failed === 'all' ? ' broken' : '')} id={id} onClick={onTap}>
      {failed === 'all'
        ? <div className="exmedia-x"><Icon name="dumbbell" /></div>
        : <img ref={imageRef} decoding="async" draggable={false} src={displaySrc} alt={exerciseNameFor(ex)} onLoad={onImageLoad} onError={onError} />}
      {minimizable && (
        <button className="giftoggle" onClick={toggleSize}>
          <Icon name={mini ? 'expand' : 'minimize'} />{mini ? t('Expand') : t('Minimize')}
        </button>
      )}
      {!mini && canAnimate && !failed && (
        <button type="button" className="gifhint" aria-pressed={!playing} aria-label={playing ? t('Pause animation') : t('Play animation')} onClick={togglePlayback}>
          <Icon name={playing ? 'pause' : 'play'} />{playing ? t('tap to pause') : t('tap to play')}
        </button>
      )}
      {snapshotError && canAnimate && !mini && !failed && <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>{t('Animation pause is unavailable in this browser.')}</span>}
    </div>
  )
}

export function Thumb({ ex }) {
  const privateSrc = usePrivateAsset(ex)
  if (!ex.img && !ex.media?.id) return <div className="thumb thumb-x"><Icon name={exerciseThumbGlyph(ex.icon)} /></div>
  if (ex.media?.id && !privateSrc) return <div className="thumb thumb-x" aria-busy="true"><Icon name="dumbbell" /></div>
  return <img className="thumb" loading="lazy" decoding="async" draggable={false} src={ex.media?.id ? privateSrc : imgSrc(ex)} alt="" />
}
