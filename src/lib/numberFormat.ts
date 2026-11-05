const formats = new Map<string, Intl.NumberFormat>()

/**
 * A shared `Intl.NumberFormat` per language and options. Building one costs far
 * more than formatting, and the turn header and the composer format on every
 * render while a turn streams.
 */
export function numberFormat(lang: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = options ? `${lang}|${JSON.stringify(options)}` : lang
  let format = formats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(lang, options)
    formats.set(key, format)
  }
  return format
}
