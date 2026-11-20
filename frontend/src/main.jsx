import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const publicShare = location.pathname.startsWith('/s/')
const Screen = publicShare ? lazy(() => import('./views/SharePage.jsx')) : lazy(() => import('./App.jsx'))

// Public shares never boot the app store or register a service worker.
if (!publicShare && 'scrollRestoration' in history) history.scrollRestoration = 'manual'
createRoot(document.getElementById('root')).render(
  <StrictMode><Suspense fallback={null}><Screen /></Suspense></StrictMode>
)
if (!publicShare && import.meta.env.VITE_MOBILE !== '1' && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
