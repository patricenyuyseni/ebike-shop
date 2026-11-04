import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, resetCsrf } from './api'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('api client', () => {
  beforeEach(() => resetCsrf())
  afterEach(() => vi.restoreAllMocks())

  it('sends the CSRF token on POST but not on GET', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => String(url).endsWith('/csrf') ? json(200, { csrf_token: 'tok123' }) : json(200, { ok: true }))
    await api('/api/things'); await api('/api/things', { method: 'POST', body: { a: 1 } })
    const calls = f.mock.calls.filter(([u]) => !String(u).endsWith('/csrf'))
    expect((calls[0][1]!.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
    expect((calls[1][1]!.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok123')
    expect(calls[1][1]!.credentials).toBe('include')
  })

  it('refreshes the token and retries once on a CSRF failure', async () => {
    let n = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/csrf')) return json(200, { csrf_token: `t${++n}` })
      return n < 2 ? json(403, { detail: 'Security check failed. Please refresh the page and try again.' }) : json(200, { done: true })
    })
    expect(await api('/api/x', { method: 'POST', body: {} })).toEqual({ done: true })
  })

  it('turns server errors into friendly ApiErrors with field messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => String(url).endsWith('/csrf') ? json(200, { csrf_token: 't' }) : json(422, { detail: 'Please check the highlighted fields.', errors: [{ field: 'email', message: 'bad email' }] }))
    await expect(api('/api/x', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 422, fieldErrors: { email: 'bad email' } })
  })

  it('reports network failure clearly', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fail'))
    await expect(api('/api/x')).rejects.toBeInstanceOf(ApiError)
    await expect(api('/api/x')).rejects.toThrow(/Cannot reach the server/)
  })
})
