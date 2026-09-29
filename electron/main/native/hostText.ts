/**
 * Textos que pinta el proceso principal: menú nativo, bandeja, avisos y el
 * diálogo de actualización.
 *
 * main no ve el catálogo del renderer ni su idioma, y estos textos se
 * construían en español fijo aunque la interfaz estuviera en inglés. El
 * renderer le dice a main su idioma (`app.setLanguage`) y main lo guarda para
 * el próximo arranque; hasta entonces decide el idioma del sistema.
 */

export type HostLanguage = 'es' | 'en'

export function isHostLanguage(value: unknown): value is HostLanguage {
  return value === 'es' || value === 'en'
}

/** Idioma antes de que el renderer diga el suyo: el del sistema. */
export function hostLanguageFromLocale(locale: string): HostLanguage {
  return locale.toLowerCase().startsWith('es') ? 'es' : 'en'
}

const ES = {
  menuFile: 'Archivo',
  menuNewChat: 'Nueva conversación',
  menuOpenFolder: 'Abrir carpeta…',
  menuCloseSession: 'Cerrar sesión',
  menuSettings: 'Configuración…',
  menuQuit: 'Salir',
  menuEdit: 'Editar',
  menuUndo: 'Deshacer',
  menuRedo: 'Rehacer',
  menuCut: 'Cortar',
  menuCopy: 'Copiar',
  menuPaste: 'Pegar',
  menuSelectAll: 'Seleccionar todo',
  menuView: 'Ver',
  menuNormal: 'Normal',
  menuBoards: 'Boards',
  menuFlows: 'Flujos',
  menuSidebar: 'Barra lateral',
  menuFiles: 'Panel de archivos',
  menuBrowser: 'Panel de navegador',
  menuWorkspace: 'Panel de Workspace',
  menuTerminal: 'Terminal',
  menuCommands: 'Paleta de comandos',
  menuZoomIn: 'Acercar',
  menuZoomOut: 'Alejar',
  menuZoomReset: 'Tamaño real',
  menuHelp: 'Ayuda',
  menuAbout: 'Acerca de Rinari Agent',
  menuEngine: 'Estado del motor',
  menuUpdates: 'Buscar actualizaciones',
  trayOpen: 'Abrir Rinari',
  trayQuit: 'Salir',
  trayNoticeTitle: 'Rinari sigue en la bandeja',
  trayNoticeBody: 'Ábrela desde su icono en la bandeja del sistema. Para salir, usa «Salir» en ese menú.',
  updateRestart: 'Reiniciar y actualizar',
  updateCancel: 'Cancelar',
  updateQuestion: '¿Aplicar la actualización ahora?',
  updateDetail: 'Rinari cerrará el Engine y reiniciará con la versión descargada. Los turnos y procesos activos se interrumpen.',
}

export type HostText = typeof ES

const EN: HostText = {
  menuFile: 'File',
  menuNewChat: 'New conversation',
  menuOpenFolder: 'Open folder…',
  menuCloseSession: 'Close session',
  menuSettings: 'Settings…',
  menuQuit: 'Quit',
  menuEdit: 'Edit',
  menuUndo: 'Undo',
  menuRedo: 'Redo',
  menuCut: 'Cut',
  menuCopy: 'Copy',
  menuPaste: 'Paste',
  menuSelectAll: 'Select all',
  menuView: 'View',
  menuNormal: 'Normal',
  menuBoards: 'Boards',
  menuFlows: 'Flows',
  menuSidebar: 'Sidebar',
  menuFiles: 'Files panel',
  menuBrowser: 'Browser panel',
  menuWorkspace: 'Workspace panel',
  menuTerminal: 'Terminal',
  menuCommands: 'Command palette',
  menuZoomIn: 'Zoom in',
  menuZoomOut: 'Zoom out',
  menuZoomReset: 'Actual size',
  menuHelp: 'Help',
  menuAbout: 'About Rinari Agent',
  menuEngine: 'Engine status',
  menuUpdates: 'Check for updates',
  trayOpen: 'Open Rinari',
  trayQuit: 'Quit',
  trayNoticeTitle: 'Rinari is still running in the system tray',
  trayNoticeBody: 'Open it from its icon in the system tray. To quit, use “Quit” in that menu.',
  updateRestart: 'Restart and update',
  updateCancel: 'Cancel',
  updateQuestion: 'Apply the update now?',
  updateDetail: 'Rinari will close the Engine and restart with the downloaded version. Active turns and processes are interrupted.',
}

export function hostText(language: HostLanguage): HostText {
  return language === 'es' ? ES : EN
}
