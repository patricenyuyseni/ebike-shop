import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Alert, Button, ErrorState, PageLoader } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { formatMoney } from '../lib/format'
import type { Order } from '../lib/types'
import { useAsync } from '../lib/useAsync'

/** Stand-in for a real payment provider page. Only works while the server is in TEST mode. */
export default function PayTest() {
  const { number = '' } = useParams()
  const token = useSearchParams()[0].get('token') ?? ''
  const nav = useNavigate()
  const [busy, setBusy] = useState<'succeeded' | 'failed' | null>(null)
  const [err, setErr] = useState('')
  const res = useAsync((s) => api<Order>(`/api/orders/${number}?token=${encodeURIComponent(token)}`, { signal: s }), [number, token])

  async function simulate(outcome: 'succeeded' | 'failed') {
    setBusy(outcome); setErr('')
    try { await api(`/api/payments/test/${number}/simulate?token=${encodeURIComponent(token)}`, { method: 'POST', body: { outcome } }); nav(`/order/${number}?token=${encodeURIComponent(token)}`) }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong'); setBusy(null) }
  }
  if (res.loading) return <PageLoader />
  if (res.error || !res.data) return <div className="container-x py-12"><ErrorState message={res.error?.message ?? 'Order not found'} /></div>
  const o = res.data
  return (
    <div className="container-x max-w-xl py-12">
      <Seo title="Test payment" noindex />
      <Alert kind="warning"><strong>TEST MODE.</strong> This is a simulated payment page. No real money moves and no real card or mobile-money details are asked for.</Alert>
      <div className="card mt-6 p-6">
        <h1 className="text-2xl font-extrabold">Pay for order {o.number}</h1>
        <p className="mt-2 text-3xl font-extrabold">{formatMoney(o.total_minor, o.currency)}</p>
        {o.status !== 'pending_payment' ? <div className="mt-4"><Alert kind="info">This order is already {o.status.replace('_', ' ')}.</Alert></div> : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button loading={busy === 'succeeded'} disabled={!!busy} onClick={() => simulate('succeeded')}>Simulate successful payment</Button>
            <Button variant="outline" loading={busy === 'failed'} disabled={!!busy} onClick={() => simulate('failed')}>Simulate failed payment</Button>
          </div>
        )}
        {err && <div className="mt-4"><Alert>{err}</Alert></div>}
      </div>
    </div>
  )
}
