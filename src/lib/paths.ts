/**
 * Una ruta lista para comparar: barras `/`, sin la barra final y, si es de
 * Windows (unidad `C:` o UNC), en minúsculas, porque ahí da igual. No toca el
 * disco: dos rutas con enlaces distintos siguen siendo distintas.
 */
export function pathKey(path: string): string {
  let key = path.trim().replace(/\\/g, '/')
  if (key.length > 1) key = key.replace(/\/+$/, '')
  return /^[a-zA-Z]:(\/|$)/.test(key) || key.startsWith('//') ? key.toLowerCase() : key
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b)
}
