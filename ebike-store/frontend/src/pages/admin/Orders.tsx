import { useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, ConfirmDialog, EmptyState, ErrorState, Input, LinkButton, PageLoader, Pagination, Select } from '../../components/ui'
import { OrderSummary } from '../OrderStatus'
import { useToast } from '../../context/Toast'
import { api, ApiError, downloadCsv, qs } from '../../lib/api'
import { formatDate, formatMoney, PAYMENT_LABELS, STATUS_LABELS } from '../../lib/format'
import type { Order, Paged } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHead } from './AdminLayout'

const tone = (s: string) => (s === 'cancelled' ? 'red' : s === 'pending_payment' || s === 'needs_review' ? 'amber' : 'green') as 'red' | 'amber' | 'green'

export function AdminOrders() {
  const [sp, setSp] = useSearchParams()
  const toast = useToast()
  const g = (k: string) => sp.get(k) ?? ''
  const set = (p: Record<string, string>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(p)) v ? n.set(k, v) : n.delete(k); if (!('page' in p)) n.delete('page'); setSp(n) }
  const [q, setQ] = useState(g('q'))
  const params = { q: g('q'), status: g('status'), payment_status: g('payment_status') }
  const res = useAsync((s) => api<Paged<Order>>(`/api/admin/orders${qs({ ...params, page: g('page') || 1 })}`, { signal: s }), [sp.toString()])
  return (
    <>
      <PageHead title="Orders" actions={<Button variant="outline" onClick={() => downloadCsv(`/api/admin/orders/export.csv${qs(params)}`, 'orders.csv').catch((e) => toast(e instanceof ApiError ? e.message : 'Export failed', 'error'))}>Export CSV</Button>} />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <form role="search" onSubmit={(e) => { e.preventDefault(); set({ q }) }}><label className="label" htmlFor="oq">Search number, name or email</label><div className="flex gap-2"><input id="oq" className="field" value={q} onChange={(e) => setQ(e.target.value)} /><Button type="submit" variant="dark">Search</Button></div></form>
        <Select label="Status" value={g('status')} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select label="Payment" value={g('payment_status')} onChange={(e) => set({ payment_status: e.target.value })}><option value="">All</option>{Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </div>
      {res.loading ? <PageLoader /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.items.length === 0 ? <EmptyState title="No orders found" text="Orders will appear here when customers check out." /> : (
        <>
          <div className="card overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-charcoal-100 bg-charcoal-50 text-xs uppercase tracking-wider text-charcoal-500"><tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-charcoal-100">{res.data!.items.map((o) => <tr key={o.number}><td className="p-3"><Link className="font-semibold hover:text-volt-700" to={`/admin/orders/${o.number}`}>{o.number}</Link></td><td className="p-3">{o.customer_name}<span className="block text-xs text-charcoal-400">{o.email}</span></td><td className="p-3">{formatDate(o.created_at)}</td><td className="p-3"><Badge tone={tone(o.status)}>{STATUS_LABELS[o.status] ?? o.status}</Badge></td><td className="p-3"><Badge>{PAYMENT_LABELS[o.payment_status] ?? o.payment_status}</Badge></td><td className="p-3 text-right font-semibold">{formatMoney(o.total_minor, o.currency)}</td></tr>)}</tbody></table></div>
          <Pagination page={res.data!.page} pages={res.data!.pages} onChange={(p) => set({ page: String(p) })} />
        </>)}
    </>
  )
}

export function AdminOrderDetail() {
  const { number = '' } = useParams()
  const toast = useToast()
  const res = useAsync((s) => api<Order>(`/api/admin/orders/${number}`, { signal: s }), [number])
  const [carrier, setCarrier] = useState('')
  const [track, setTrack] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function setStatus(status: string, extra: object = {}) {
    setBusy(true); setErr('')
    try { await api(`/api/admin/orders/${number}/status`, { method: 'PATCH', body: { status, ...extra } }); toast(`Order marked ${STATUS_LABELS[status] ?? status}`); setConfirm(null); res.reload() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); setConfirm(null) } finally { setBusy(false) }
  }
  async function saveTracking(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (track.trim().length < 3) { setErr('Enter a tracking number (at least 3 characters).'); return }
    try { await api(`/api/admin/orders/${number}/tracking`, { method: 'PUT', body: { carrier: carrier || null, tracking_number: track } }); toast('Tracking saved'); res.reload() } catch (x) { setErr(x instanceof ApiError ? x.message : 'Failed') }
  }
  if (res.loading && !res.data) return <PageLoader />
  if (res.error || !res.data) return <ErrorState message={res.error?.message ?? 'Error'} />
  const o = res.data
  const next: [string, string][] = ({ paid: [['processing', 'Start processing'], ['shipped', 'Mark shipped']], processing: [['shipped', 'Mark shipped']], shipped: [['delivered', 'Mark delivered']], needs_review: [['processing', 'Payment OK: process']] } as Record<string, [string, string][]>)[o.status] ?? []
  const canCancel = ['pending_payment', 'paid', 'processing', 'needs_review'].includes(o.status)
  return (
    <>
      <PageHead title={`Order ${o.number}`} sub={`${formatDate(o.created_at)} · ${o.customer_name} · ${o.email} · ${o.phone}`} actions={<LinkButton variant="outline" to="/admin/orders">← All orders</LinkButton>} />
      <div className="mb-4 flex gap-2"><Badge tone={tone(o.status)}>{STATUS_LABELS[o.status] ?? o.status}</Badge><Badge>{PAYMENT_LABELS[o.payment_status] ?? o.payment_status}</Badge></div>
      {o.status === 'needs_review' && <div className="mb-4"><Alert kind="warning">A payment arrived that needs a human check (amount mismatch, or it arrived after the order expired). Verify it in your payment provider dashboard before processing or cancelling.</Alert></div>}
      {o.payment_status === 'refund_due' && <div className="mb-4"><Alert kind="warning">This paid order was cancelled. Refund the customer in your payment provider&apos;s dashboard.</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div><OrderSummary o={o} />
          <section className="card mt-6 p-5"><h2 className="font-bold">Payments</h2>{(o.payments ?? []).map((p, i) => <p key={i} className="mt-2 text-sm">{p.provider} · <Badge tone={p.status === 'succeeded' ? 'green' : p.status === 'failed' ? 'red' : 'amber'}>{p.status}</Badge> · {formatMoney(p.amount_minor, o.currency)} {p.failure_reason && <span className="text-red-600">({p.failure_reason})</span>}</p>)}</section></div>
        <aside className="space-y-4">
          <section className="card p-5"><h2 className="font-bold">Fulfilment</h2>
            {err && <div className="mt-3"><Alert>{err}</Alert></div>}
            <form onSubmit={saveTracking} className="mt-3 space-y-3" noValidate><Input label="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder={o.tracking?.carrier ?? 'e.g. DHL'} /><Input label="Tracking number" value={track} onChange={(e) => setTrack(e.target.value)} placeholder={o.tracking?.tracking_number ?? ''} /><Button type="submit" variant="outline" className="w-full">Save tracking</Button></form>
            <div className="mt-4 flex flex-col gap-2">{next.map(([s, l]) => <Button key={s} loading={busy} onClick={() => s === 'shipped' ? setStatus('shipped', { carrier: carrier || undefined, tracking_number: track || undefined }) : setStatus(s)}>{l}</Button>)}
              {canCancel && <Button variant="outline" className="!text-red-600" onClick={() => setConfirm('cancelled')}>Cancel order</Button>}{next.length === 0 && !canCancel && <p className="text-sm text-charcoal-500">No further actions.</p>}</div>
            <p className="mt-3 text-xs text-charcoal-400">Marking as shipped emails the customer if email is configured.</p></section>
        </aside>
      </div>
      <ConfirmDialog open={!!confirm} danger loading={busy} title="Cancel this order?" text="Stock will be returned to inventory. If the customer already paid, you must refund them in your payment provider." confirmLabel="Cancel order" onClose={() => setConfirm(null)} onConfirm={() => setStatus('cancelled')} />
    </>
  )
}
