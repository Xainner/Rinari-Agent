import BoardEmptyState from './BoardEmptyState'

/**
 * Lienzo de Boards. En esta entrega solo existe el estado vacío; los paneles,
 * su restauración y el diálogo de alta llegan con el store del board.
 */
export default function BoardView() {
  return (
    <div className="board-canvas" role="region" aria-label="Boards">
      <BoardEmptyState />
    </div>
  )
}
