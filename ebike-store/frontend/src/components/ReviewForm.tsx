import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/Auth'
import { api, ApiError } from '../lib/api'
import { Alert, Button, Textarea } from './ui'

export function ReviewForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!user) return <p className="mt-4 text-sm text-charcoal-500">Bought this bike? Sign in to write a review.</p>
  if (!open) return <Button variant="outline" className="mt-4" onClick={() => setOpen(true)}>Write a review</Button>
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (body.trim().length < 10) { setMsg({ kind: 'error', text: 'Please write at least 10 characters.' }); return }
    setBusy(true)
    try { const r = await api<{ message: string }>(`/api/products/${encodeURIComponent(slug)}/reviews`, { method: 'POST', body: { rating, body } }); setMsg({ kind: 'success', text: r.message }); setBody(''); onDone() }
    catch (x) { setMsg({ kind: 'error', text: x instanceof ApiError ? x.message : 'Could not send your review.' }) }
    finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="card mt-4 max-w-xl space-y-3 p-5" noValidate>
      <div><label htmlFor="rating" className="label">Rating</label><select id="rating" className="field !w-40" value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select></div>
      <Textarea label="Your review" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Button type="submit" loading={busy}>Submit review</Button>
    </form>
  )
}
