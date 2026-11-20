import { MOBILE, shareBlob } from './mobile.js'

// Share a self-contained page when the platform supports files; otherwise download it.
export async function shareHtmlPage(html, filename) {
  const blob = new Blob([html], { type: 'text/html' })
  if (MOBILE) return shareBlob(blob, filename)
  const file = new File([blob], filename, { type: 'text/html' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title: filename })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.style.display = 'none'
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
