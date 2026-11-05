import { useInsertionEffect, useRef, useState } from 'react'

/**
 * A function with a stable identity that always calls the latest `fn`. For
 * event handlers passed to memoized children: a parent that re-renders on
 * every streamed delta and passes inline closures would otherwise re-render
 * the whole composer and every turn row with it. `undefined` stays
 * `undefined`, so optional handlers keep meaning "not offered".
 *
 * Not for functions called during render: the latest `fn` is stored after
 * the render that passes it.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
export function useStableCallback<A extends unknown[], R>(fn: ((...args: A) => R) | undefined): ((...args: A) => R) | undefined
export function useStableCallback<A extends unknown[], R>(fn: ((...args: A) => R) | undefined): ((...args: A) => R) | undefined {
  const latest = useRef(fn)
  useInsertionEffect(() => {
    latest.current = fn
  })
  const [stable] = useState(() => (...args: A): R => latest.current!(...args))
  return fn ? stable : undefined
}
