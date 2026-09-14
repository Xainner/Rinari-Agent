export type DesktopAction =
  | 'new-chat'
  | 'open-folder'
  | 'close-session'
  | 'settings'
  | 'appearance'
  | 'engine'
  | 'updates'
  | 'about'
  | 'sidebar'
  | 'files'
  | 'commands'
  | 'processes'
  | 'undo'
  | 'redo'
export function dispatchAction(action: DesktopAction) {
  window.dispatchEvent(new CustomEvent('rinari-action', { detail: action }))
}
