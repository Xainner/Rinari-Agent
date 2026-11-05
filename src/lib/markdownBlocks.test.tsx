// @vitest-environment jsdom
// F1: a streaming message is rendered block by block so a delta re-parses
// only the open block. Splitting must never change what the Markdown says.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Markdown from '../components/Markdown'
import { splitMarkdownBlocks } from './markdownBlocks'

const html = (text: string, blocks: boolean) => renderToStaticMarkup(<Markdown blocks={blocks}>{text}</Markdown>).replace(/>\s+</g, '><')

const DOCS: Record<string, string> = {
  paragraphs: 'Uno con `código` y **negrita**.\n\nDos, con un [enlace](https://example.com).\n\n\nTres tras dos líneas en blanco.',
  headings: '# Título\n\nTexto.\n\n## Sección\n\nMás texto\ncon salto suave.\n\nSetext\n======\n\n---\n\nFin.',
  fence: 'Antes:\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\nDespués.\n\n~~~\nsin lenguaje\n\n~~~\n',
  openFence: 'Texto.\n\n```py\nprint(1)\n\nprint(2)',
  tightList: '- uno\n- dos\n- tres\n\nDespués de la lista.',
  looseList: '1. uno\n\n2. dos\n\n3. tres\n\nPárrafo.',
  nestedList: '- uno\n\n  continúa en el ítem\n\n  - anidado\n\n- dos\n\nFin.',
  quote: '> cita\n> sigue\n\n> otra cita\n\nTexto.',
  table: '| a | b |\n|---|---|\n| 1 | 2 |\n\nDebajo de la tabla.',
  indentedCode: 'Párrafo.\n\n    código indentado\n\n    más código\n\nFin.',
  references: 'Ver [la guía][g].\n\nOtro párrafo.\n\n[g]: https://example.com',
  footnotes: 'Una nota[^1].\n\nOtro.\n\n[^1]: La nota.',
  html: '<!-- comentario\n\ncon blanco -->\n\nTexto.',
}

describe('splitMarkdownBlocks', () => {
  it('rebuilds the source exactly', () => {
    for (const doc of Object.values(DOCS)) expect(splitMarkdownBlocks(doc).map((block) => block.text).join('')).toBe(doc)
  })

  it('splits paragraphs and keeps each start offset', () => {
    const blocks = splitMarkdownBlocks(DOCS.paragraphs)
    expect(blocks.length).toBe(3)
    for (const block of blocks) expect(DOCS.paragraphs.slice(block.start, block.start + block.text.length)).toBe(block.text)
  })

  it('never splits inside a fence, open or closed', () => {
    expect(splitMarkdownBlocks(DOCS.fence).map((block) => block.text.trim().split('\n')[0])).toEqual(['Antes:', '```ts', 'Después.', '~~~'])
    expect(splitMarkdownBlocks(DOCS.openFence).at(-1)!.text).toBe('```py\nprint(1)\n\nprint(2)')
  })

  it('keeps one list together and a continuation with its item', () => {
    expect(splitMarkdownBlocks(DOCS.looseList).length).toBe(2)
    expect(splitMarkdownBlocks(DOCS.nestedList).length).toBe(2)
  })

  it('parses whole what can tie blocks from afar', () => {
    for (const name of ['references', 'footnotes', 'html']) expect(splitMarkdownBlocks(DOCS[name]).length).toBe(1)
  })

  it('renders the same HTML block by block as whole', () => {
    for (const [name, doc] of Object.entries(DOCS)) expect(html(doc, true), name).toBe(html(doc, false))
  })
})
