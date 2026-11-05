/** A top-level piece of a Markdown text and where it starts in the source. */
export interface MarkdownBlock {
  text: string
  start: number
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const LIST_ITEM = /^ {0,3}([-*+]|\d{1,9}[.)])(\s|$)/
const BLANK = /^\s*$/
/**
 * What can tie two blocks across a blank line: link reference definitions and
 * footnotes are used far from where they are defined, and these HTML blocks
 * may contain blank lines. A text with any of them is parsed whole.
 */
const WHOLE = [/^ {0,3}\[[^\]\n]+\]:/m, /\[\^[^\]\n]*\]/, /^ {0,3}<(pre|script|style|textarea|!--)/im]

/**
 * Splits a Markdown text at blank lines between top-level blocks, so a
 * streaming message re-parses only its last, open block: the closed ones keep
 * their text and their render. A split happens only where Markdown cannot
 * join the two sides: never inside a fenced code block, before an indented
 * line (a list item's continuation or indented code) or between the items of
 * one list (that would turn a loose list into two). The blocks concatenate
 * back to the source.
 */
export function splitMarkdownBlocks(source: string): MarkdownBlock[] {
  if (WHOLE.some((pattern) => pattern.test(source))) return [{ text: source, start: 0 }]
  const starts = [0]
  let fence: { char: string; length: number } | null = null
  let afterBlank = false
  let listInBlock = false
  let offset = 0
  for (const line of source.split('\n')) {
    const lineStart = offset
    offset += line.length + 1
    if (fence) {
      const close = FENCE.exec(line)
      if (close && close[1][0] === fence.char && close[1].length >= fence.length && BLANK.test(line.slice(close[0].length))) fence = null
      continue
    }
    if (BLANK.test(line)) {
      afterBlank = lineStart > 0
      continue
    }
    const listItem = LIST_ITEM.test(line)
    if (afterBlank && !/^[ \t]/.test(line) && !(listItem && listInBlock)) {
      starts.push(lineStart)
      listInBlock = false
    }
    afterBlank = false
    if (listItem) listInBlock = true
    const open = FENCE.exec(line)
    if (open) fence = { char: open[1][0], length: open[1].length }
  }
  return starts.map((start, index) => ({ text: source.slice(start, starts[index + 1] ?? source.length), start }))
}
