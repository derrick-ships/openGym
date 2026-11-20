import { useUI } from '../store/useUI.js'
import { AiButtons } from './PublicAiButtons.jsx'

export function AiShareButtons(props) {
  const toast = useUI(s => s.toast)
  return <AiButtons {...props} notify={toast} />
}
