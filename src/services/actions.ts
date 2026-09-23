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
  /** Abre el dock de la sesión en la superficie de navegador (doc 03 §1). */
  | 'browser'
  /**
   * Abre el dock de la sesión en la superficie **Workspace**.
   *
   * No es `view = 'workspace'`: la vista global y la pestaña del dock comparten
   * nombre y son cosas distintas. Se llama `workspace-panel` para que el menú,
   * la paleta y la barra superior compartan una ruta que no colisione con ella.
   */
  | 'workspace-panel'
  | 'commands'
  | 'processes'
  | 'undo'
  | 'redo'
  // Vistas de trabajo. Los botones y el menú seleccionan de forma idempotente;
  // solo el atajo alterna.
  | 'view-normal'
  | 'view-boards'
  | 'view-flows'
  | 'toggle-boards'
  // Boards: colapso, modo foco y lectura masiva. Destino estable: el store
  // del board; tarjetas, menú y paleta despachan lo mismo.
  | 'collapse-pane'
  | 'expand-pane'
  | 'collapse-all-panes'
  | 'expand-all-panes'
  | 'collapse-finished-panes'
  | 'toggle-focus-mode'
  | 'mark-all-board-results-read'

export function dispatchAction(action: DesktopAction) {
  window.dispatchEvent(new CustomEvent('rinari-action', { detail: action }))
}

/**
 * Acciones cuyo significado depende de la vista de trabajo. Centralizado
 * para que Ctrl+N / Ctrl+W no se repliquen en cuatro handlers.
 */
export type ContextualAction = 'new' | 'close'

export interface ActionContext {
  view: 'chat' | 'board' | string
}

/** Qué hace una acción contextual en la vista actual. */
export function resolveContextualAction(action: ContextualAction, context: ActionContext):
  | 'new-chat'
  | 'add-pane'
  | 'close-session'
  | 'remove-pane' {
  if (context.view === 'board') return action === 'new' ? 'add-pane' : 'remove-pane'
  return action === 'new' ? 'new-chat' : 'close-session'
}
