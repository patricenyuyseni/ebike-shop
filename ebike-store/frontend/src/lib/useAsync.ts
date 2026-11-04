import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError(null)
    fnRef.current(ctl.signal)
      .then((d) => { if (!ctl.signal.aborted) { setData(d); setLoading(false) } })
      .catch((e) => { if (!ctl.signal.aborted) { setError(e instanceof ApiError ? e : new ApiError(0, 'Something went wrong.')); setLoading(false) } })
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}
