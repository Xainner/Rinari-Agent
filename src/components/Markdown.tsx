import { Suspense, lazy, memo, useEffect, useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, ImageOff } from 'lucide-react'
import { useI18n } from '../i18n'
import { highlightToHtml } from '../lib/highlight'
import { containsMath, escapeCurrency } from '../lib/math-detect'
import { copyText } from '../lib/clipboard'

import { ArtifactImage, FileLink, fileUrlTransform } from '../features/files/FileWorkspace'

const MathMarkdown = lazy(() => import('./MathMarkdown'))

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Carga lazy del highlighter al aparecer el primer bloque (fetch de una vez).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHtml(null)
    void highlightToHtml(code, language).then((h) => {
      if (!cancelled && h) setHtml(h)
    })
    return () => {
      cancelled = true
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
      <FileLink href={props.href}>{children}</FileLink>
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

function Markdown({ children: raw }: { children: string }) {
  const children = escapeCurrency(raw)
  if (containsMath(children)) {
    return (
      <div className="md-body">
        <Suspense fallback={<BaseMarkdown>{children}</BaseMarkdown>}>
          <MathMarkdown>{children}</MathMarkdown>
        </Suspense>
      </div>
    )
  }
  return (
    <div className="md-body">
      <BaseMarkdown>{children}</BaseMarkdown>
    </div>
  )
}

function BaseMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown urlTransform={fileUrlTransform} remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  )
}

export default memo(Markdown)
