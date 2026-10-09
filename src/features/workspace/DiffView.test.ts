import { describe, expect, it } from 'vitest'
import { diffStats, parseUnifiedDiff } from './DiffView'

const DIFF = `diff --git a/a.ts b/a.ts
index 1..2 100644
--- a/a.ts
+++ b/a.ts
@@ -1,4 +1,5 @@ export function f()
 const a = 1
-const total = a + 2
+const total = a + 3
+const extra = true
 return total
\\ No newline at end of file
`

describe('parseUnifiedDiff', () => {
  it('numbers each line in the old and new file and drops headers', () => {
    const rows = parseUnifiedDiff(DIFF)
    expect(rows[0]).toMatchObject({ kind: 'hunk' })
    expect(rows[1]).toMatchObject({ kind: 'context', text: 'const a = 1', oldLine: 1, newLine: 1 })
    expect(rows[2]).toMatchObject({ kind: 'del', oldLine: 2 })
    expect(rows[3]).toMatchObject({ kind: 'add', newLine: 2 })
    expect(rows[4]).toMatchObject({ kind: 'add', newLine: 3, text: 'const extra = true' })
    expect(rows.some((row) => row.text.startsWith('diff --git'))).toBe(false)
    expect(rows.at(-1)).toMatchObject({ kind: 'meta' })
  })

  it('marks only the changed span of a replaced line', () => {
    const rows = parseUnifiedDiff('@@ -1 +1 @@\n-const total = a + 2\n+const total = a + 3\n')
    expect(rows[1].change).toEqual([18, 19])
    expect(rows[2].change).toEqual([18, 19])
  })

  it('counts added and removed lines', () => {
    expect(diffStats(parseUnifiedDiff(DIFF))).toEqual({ added: 2, removed: 1 })
  })
})
