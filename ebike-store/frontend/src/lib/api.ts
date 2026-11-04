import { site } from '../config/site'

export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string>
  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

let csrfToken: string | null = null

async function getCsrf(force = false): Promise<string> {
  if (!csrfToken || force) {
    const r = await fetch(`${site.apiBase}/api/auth/csrf`, { credentials: 'include' })
    csrfToken = (await r.json()).csrf_token as string
  }
  return csrfToken
}

export function resetCsrf() { csrfToken = null }

async function toError(res: Response): Promise<ApiError> {
  let detail = 'Something went wrong. Please try again.'
  const fieldErrors: Record<string, string> = {}
  try {
    const data = await res.json()
    if (typeof data.detail === 'string') detail = data.detail
    if (Array.isArray(data.errors)) for (const e of data.errors) fieldErrors[e.field] = e.message
  } catch { /* not JSON */ }
  return new ApiError(res.status, detail, fieldErrors)
}

interface Opts { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal }

export async function api<T>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers['X-CSRF-Token'] = await getCsrf()
  let res: Response
  try {
    res = await fetch(`${site.apiBase}${path}`, {
      method, headers, credentials: 'include', signal: opts.signal,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection and try again.')
  }
  if (res.status === 403 && method !== 'GET' && !retried) {
    const text = await res.clone().text()
    if (text.includes('Security check failed')) { await getCsrf(true); return api<T>(path, opts, true) }
  }
  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** File upload with a real progress bar (fetch cannot report upload progress, XMLHttpRequest can). */
export async function uploadFile<T>(path: string, file: File, onProgress: (pct: number) => void): Promise<T> {
  const token = await getCsrf()
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${site.apiBase}${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('X-CSRF-Token', token)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed: cannot reach the server.'))
    xhr.onload = () => {
      let data: { detail?: string } = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T)
      else reject(new ApiError(xhr.status, typeof data.detail === 'string' ? data.detail : 'Upload failed.'))
    }
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

export async function downloadCsv(path: string, filename: string): Promise<void> {
  const res = await fetch(`${site.apiBase}${path}`, { credentials: 'include' })
  if (!res.ok) throw await toError(res)
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export const qs = (params: Record<string, string | number | boolean | null | undefined>): string => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
