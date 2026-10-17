/** Lo que se arrastra del árbol de Archivos al composer: el mismo archivo que «@archivo» (#98). */
export const TREE_FILE_MIME = 'application/x-rinari-file'
/** «Mencionar en el chat» desde el árbol: el composer de esa conversación lo recibe como «@archivo». */
export const MENTION_FILE_EVENT = 'rinari:mention-file'
export interface TreeFileRef { sessionId: string; path: string; relative_path: string; name: string }
