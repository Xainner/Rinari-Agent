import { Suspense, lazy, memo, useEffect, useRef, useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, ImageOff } from 'lucide-react'
import { useI18n } from '../i18n'
import { highlightToHtml } from '../lib/highlight'
import { containsMath, escapeCurrency } from '../lib/math-detect'
import rehypeStreamWords from '../lib/rehypeStreamWords'
import { copyText } from '../lib/clipboard'

import { ArtifactImage, FileLink, InlineMedia, PathCode, fileUrlTransform, looksLikeLocalPath } from '../features/files/FileWorkspace'

const MathMarkdown = lazy(() => import('./MathMarkdown'))

/** Como mucho un resaltado cada tanto mientras el bloque crece (#58). */
const HIGHLIGHT_EVERY_MS = 250

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [html, setHtml] = useState<string | null>(null)
  const lastRun = useRef(0)

  useEffect(() => {
    let cancelled = false
    // Mientras el bloque llega token a token se conserva el último resaltado
    // (no se vuelve a `<pre>` sin colores en cada token) y se resalta como
    // mucho unas cuatro veces por segundo (plan 0.4.0 #58): la altura ya no
    // cambia dos veces por token. La carga del highlighter es lazy.
    const wait = Math.max(0, lastRun.current + HIGHLIGHT_EVERY_MS - Date.now())
    const timer = window.setTimeout(() => {
      lastRun.current = Date.now()
      void highlightToHtml(code, language).then((h) => {
        if (!cancelled && h) setHtml(h)
      })
    }, wait)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [code, language])

  async function copy() {
    if (await copyText(code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-ink-900/80">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-mist-500">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={t('markdown.copy')}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-mist-400 transition-colors hover:bg-white/5 hover:text-mist-100"
        >
          {copied ? <Check size={13} className="text-nebula-400" /> : <Copy size={13} />}
          {copied ? t('markdown.copied') : t('markdown.copy')}
        </button>
      </div>
      {html ? (
        <div
          className="shiki-wrap overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed text-mist-100">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}

export const markdownComponents: ComponentProps<typeof ReactMarkdown>['components'] = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '')
    const code = String(children).replace(/\n$/, '')
    const isBlock = !!match || code.includes('\n')
    if (!isBlock) {
      // Una ruta local que existe se vuelve enlace al archivo (#35).
      if (looksLikeLocalPath(code)) return <PathCode text={code} className={className} />
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }
    return <CodeBlock code={code} language={match ? match[1] : ''} />
  },
  a({ children, ...props }) {
    return (
      <>
        <FileLink href={props.href}>{children}</FileLink>
        {props.href && <InlineMedia href={props.href} />}
      </>
    )
  },
  // The renderer cannot load `artifact://`: an image the agent put in its
  // message is read from the artifact store instead of rendering broken.
  img({ src, alt }) {
    if (typeof src === 'string' && src.startsWith('artifact://')) return <ArtifactImage uri={src} alt={alt ?? ''} />
    // A local path (file://, C:\…) cannot load in the renderer: say what it
    // is instead of showing a broken image.
    if (typeof src === 'string' && /^(file:|[A-Za-z]:[\\/]|\/)/.test(src)) return <LocalImageNotice src={src} alt={alt ?? ''} />
    return <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} />
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table>{children}</table>
      </div>
    )
  },
}

function LocalImageNotice({ src, alt }: { src: string; alt: string }) {
  const { t } = useI18n()
  const name = decodeURIComponent(src.split(/[\\/]/).pop() || src)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-muted)]" title={src}>
      <ImageOff size={13} aria-hidden="true" />
      {t('markdown.localImage', { name: alt || name })}
    </span>
  )
}

/**
 * `stream`: el texto llega en vivo (#52); las palabras desde `fadeFrom`
 * entran con un fundido y las de después de `shownTo` esperan invisibles.
 */
function Markdown({ children: raw, stream }: { children: string; stream?: { fadeFrom: number; shownTo?: number } }) {
  const children = escapeCurrency(raw)
  // Una vez que el texto tiene matemáticas, se queda en el renderizador de
  // matemáticas: si cambiara de idea a mitad del streaming, todo el bloque se
  // volvería a montar (#58).
  const math = useRef(false)
  if (!math.current && containsMath(children)) math.current = true
  if (math.current) {
    return (
      <div className="md-body">
        <Suspense fallback={<BaseMarkdown>{children}</BaseMarkdown>}>
          <MathMarkdown>{children}</MathMarkdown>
        </Suspense>
      </div>
    )
  }
  return (
    <div className="md-body" data-streaming={stream ? true : undefined}>
      <BaseMarkdown stream={stream}>{children}</BaseMarkdown>
    </div>
  )
}

function BaseMarkdown({ children, stream }: { children: string; stream?: { fadeFrom: number; shownTo?: number } }) {
  return (
    <ReactMarkdown urlTransform={fileUrlTransform} remarkPlugins={[remarkGfm]} rehypePlugins={stream ? [[rehypeStreamWords, stream]] : undefined} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  )
}

export default memo(Markdown)
