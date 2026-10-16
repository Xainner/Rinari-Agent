// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { addressToUrl, CHAT_KEY, useBrowserPrefs } from './browserPrefs'

beforeEach(() => {
  window.localStorage.clear()
  useBrowserPrefs.setState({ engine: 'duckduckgo', recent: {}, pinned: {} })
})

describe('addressToUrl (plan 0.4.0 #46)', () => {
  it('opens an address and searches a text, with DuckDuckGo by default', () => {
    expect(addressToUrl('example.com', 'duckduckgo')).toBe('https://example.com')
    expect(addressToUrl('example.com/a?b=1', 'duckduckgo')).toBe('https://example.com/a?b=1')
    expect(addressToUrl('https://a.example', 'duckduckgo')).toBe('https://a.example')
    expect(addressToUrl('localhost:5173', 'duckduckgo')).toBe('http://localhost:5173')
    expect(addressToUrl('127.0.0.1:8000/x', 'duckduckgo')).toBe('http://127.0.0.1:8000/x')
    expect(addressToUrl('cómo hacer pan', 'duckduckgo')).toBe('https://duckduckgo.com/?q=c%C3%B3mo%20hacer%20pan')
    expect(addressToUrl('rinari', 'google')).toBe('https://www.google.com/search?q=rinari')
    expect(addressToUrl('   ', 'duckduckgo')).toBe('')
  })
})

describe('recent and pinned places, per project', () => {
  it('keeps the latest visits first, without duplicates, and only web pages', () => {
    const { recordVisit } = useBrowserPrefs.getState()
    recordVisit('p1', { url: 'https://a.example/', title: 'A' })
    recordVisit('p1', { url: 'https://b.example/', title: 'B' })
    recordVisit('p1', { url: 'https://a.example/', title: 'A2' })
    recordVisit('p1', { url: 'about:blank' })
    recordVisit(CHAT_KEY, { url: 'https://c.example/' })
    const state = useBrowserPrefs.getState()
    expect(state.recent.p1.map((place) => [place.url, place.title])).toEqual([
      ['https://a.example/', 'A2'],
      ['https://b.example/', 'B'],
    ])
    expect(state.recent[CHAT_KEY].map((place) => place.url)).toEqual(['https://c.example/'])
    // Se guarda: la página de inicio lo encuentra al volver.
    expect(window.localStorage.getItem('rinari.browser.v1')).toContain('https://b.example/')
  })

  it('pins and unpins a page', () => {
    const { togglePin } = useBrowserPrefs.getState()
    togglePin('p1', { url: 'https://a.example/', title: 'A' })
    expect(useBrowserPrefs.getState().isPinned('p1', 'https://a.example/')).toBe(true)
    expect(useBrowserPrefs.getState().isPinned('p2', 'https://a.example/')).toBe(false)
    togglePin('p1', { url: 'https://a.example/' })
    expect(useBrowserPrefs.getState().isPinned('p1', 'https://a.example/')).toBe(false)
  })
})
