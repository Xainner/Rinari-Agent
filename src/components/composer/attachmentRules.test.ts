import { describe, expect, it } from 'vitest'
import { attachmentCategory, contentKey, maxBytes } from './attachmentRules'

describe('attachmentRules (#57)', () => {
  it('mirrors what the Engine accepts', () => {
    expect(attachmentCategory('a.PNG')).toBe('image')
    expect(attachmentCategory('ers - Time Force.mp3')).toBe('audio')
    expect(attachmentCategory('x', 'video/mp4')).toBe('video')
    expect(attachmentCategory('informe.pptx')).toBe('document')
    expect(attachmentCategory('Dockerfile')).toBe('text')
    expect(attachmentCategory('setup.exe')).toBeNull()
    expect(attachmentCategory('anim.gif', 'image/gif')).toBeNull()
  })

  it('media gets the download cap, images and documents their own', () => {
    expect(maxBytes('video')).toBe(1024 * 1024 * 1024)
    expect(maxBytes('image')).toBe(10 * 1024 * 1024)
    expect(maxBytes('document')).toBe(25 * 1024 * 1024)
  })

  it('content keys tell equal data apart from different data', () => {
    expect(contentKey('data:a')).toBe(contentKey('data:a'))
    expect(contentKey('data:a')).not.toBe(contentKey('data:b'))
  })
})
