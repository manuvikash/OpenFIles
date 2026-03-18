import { useEffect, useRef, useState, startTransition } from 'react'

/**
 * Returns a ref to attach to a DOM element and a boolean that becomes true
 * once that element enters the viewport.
 *
 * The state update is wrapped in startTransition so React treats it as
 * non-urgent — it will never interrupt an in-progress scroll frame to
 * process the visibility change.
 */
export function useInView(rootMargin = '60px') {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || inView) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Non-urgent: React can batch and defer this render rather than
          // interrupting the scroll thread.
          startTransition(() => setInView(true))
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return { ref, inView }
}
