import { expect, it } from 'vitest'
import { pathKey, samePath } from './paths'

it('compara rutas de Windows sin importar barras, mayúsculas ni la barra final', () => {
  expect(samePath('C:\\Users\\Ana\\repo\\', 'c:/users/ana/repo')).toBe(true)
  expect(samePath('\\\\server\\Share\\x', '//SERVER/share/x/')).toBe(true)
  expect(pathKey('C:\\')).toBe('c:')
})

it('en rutas POSIX las mayúsculas cuentan', () => {
  expect(samePath('/home/ana/Repo/', '/home/ana/Repo')).toBe(true)
  expect(samePath('/home/ana/Repo', '/home/ana/repo')).toBe(false)
  expect(pathKey('/')).toBe('/')
})
