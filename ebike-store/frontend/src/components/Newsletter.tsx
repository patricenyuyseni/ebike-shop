import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { isEmail } from '../lib/validate'
import { Alert, Button, Input } from './ui'

export function Newsletter() {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isEmail(email)) { setErr('Enter a valid email address.'); return }
    setErr(''); setBusy(true)
    try { await api('/api/newsletter', { method: 'POST', body: { email } }); setDone(true) }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }
  return (
    <section className="bg-charcoal-950 py-16 text-white" aria-labelledby="nl-h">
      <div className="container-x grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h2 id="nl-h" className="text-3xl font-extrabold !text-white">Get new arrivals and offers first</h2>
          <p className="mt-2 text-charcoal-300">Join our list. No spam, unsubscribe any time.</p>
        </div>
        {done ? <Alert kind="success">Thanks for subscribing! You&apos;re on the list.</Alert> : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1"><label htmlFor="nl-email" className="sr-only">Email address</label>
              <input id="nl-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={!!err} className="field !border-charcoal-600 !bg-charcoal-900 !text-white" />
              {err && <p role="alert" className="mt-1 text-xs text-red-400">{err}</p>}
            </div>
            <Button loading={busy} type="submit">Subscribe</Button>
          </form>
        )}
      </div>
    </section>
  )
}
export { Input }
