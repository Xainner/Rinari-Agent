import { describe, expect, it } from 'vitest'

import { loadPage } from './loadPage'

const view = (url: string, error?: Error) => ({
  loadURL: () => (error ? Promise.reject(error) : Promise.resolve()),
  getURL: () => url,
})

describe('loadPage', () => {
  it('a redirect that aborts the first load still counts when the page is there', async () => {
    const aborted = new Error("ERR_ABORTED (-3) loading 'https://xainner.com/es/'")
    await expect(loadPage(view('https://xainner.com/es/', aborted), 'https://xainner.com')).resolves.toBeUndefined()
  })

  it('an abort that left nothing loaded is a failure', async () => {
    const aborted = new Error("ERR_ABORTED (-3) loading 'https://a.example/'")
    await expect(loadPage(view('about:blank', aborted), 'https://a.example/')).rejects.toThrow('ERR_ABORTED')
  })

  it('other errors stay errors', async () => {
    const refused = new Error("ERR_CONNECTION_REFUSED (-102) loading 'http://127.0.0.1:9/'")
    await expect(loadPage(view('http://127.0.0.1:9/', refused), 'http://127.0.0.1:9/')).rejects.toThrow('REFUSED')
  })
})
