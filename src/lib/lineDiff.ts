/**
 * Diff unificado por líneas entre dos textos, para `DiffView`.
 *
 * Lo usa la propuesta de `/init` (#81) para mostrar qué cambia en un
 * RINARI.md que ya existía. Es una subsecuencia común más larga clásica: un
 * RINARI.md se lee hasta 32 KB (unas mil líneas), así que la tabla cabe.
 */
export function unifiedDiff(before: string, after: string, path = 'RINARI.md', context = 3): string {
  const a = splitLines(before)
  const b = splitLines(after)
  const ops = diffOps(a, b)
  if (!ops.some((op) => op.kind !== ' ')) return ''
  const lines = [`--- a/${path}`, `+++ b/${path}`]
  // Agrupa los cambios en tramos con `context` líneas alrededor.
  let index = 0
  while (index < ops.length) {
    while (index < ops.length && ops[index].kind === ' ') index++
    if (index >= ops.length) break
    let start = Math.max(0, index - context)
    let end = index
    for (;;) {
      while (end < ops.length && ops[end].kind !== ' ') end++
      let quiet = 0
      while (end + quiet < ops.length && ops[end + quiet].kind === ' ' && quiet < context * 2) quiet++
      if (end + quiet < ops.length && ops[end + quiet].kind !== ' ' && quiet < context * 2) {
        end += quiet
        continue
      }
      end = Math.min(ops.length, end + context)
      break
    }
    const hunk = ops.slice(start, end)
    const oldStart = (hunk.find((op) => op.kind !== '+')?.oldLine ?? 0) + 1
    const newStart = (hunk.find((op) => op.kind !== '-')?.newLine ?? 0) + 1
    const oldCount = hunk.filter((op) => op.kind !== '+').length
    const newCount = hunk.filter((op) => op.kind !== '-').length
    lines.push(`@@ -${oldCount ? oldStart : oldStart - 1},${oldCount} +${newCount ? newStart : newStart - 1},${newCount} @@`)
    for (const op of hunk) lines.push(`${op.kind}${op.text}`)
    index = end
    start = end
  }
  return `${lines.join('\n')}\n`
}

interface Op {
  kind: ' ' | '-' | '+'
  text: string
  oldLine: number
  newLine: number
}

function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function diffOps(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  // lcs[i][j]: longitud de la subsecuencia común de a[i..] y b[j..].
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ kind: ' ', text: a[i], oldLine: i, newLine: j })
      i++
      j++
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      ops.push({ kind: '+', text: b[j], oldLine: i, newLine: j })
      j++
    } else {
      ops.push({ kind: '-', text: a[i], oldLine: i, newLine: j })
      i++
    }
  }
  return ops
}
