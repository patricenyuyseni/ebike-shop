import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, EmptyState, ErrorState, Input, Modal, PageLoader, Pagination } from '../../components/ui'
import { useToast } from '../../context/Toast'
import { api, ApiError, qs } from '../../lib/api'
import { formatDate } from '../../lib/format'
import type { Paged } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHead } from './AdminLayout'

interface Row { product_id: number; name: string; sku: string; quantity: number; threshold: number; status: string }
interface Hist { delta: number; quantity_after: number; reason: string; created_at: string }

export default function Inventory() {
  const [sp, setSp] = useSearchParams()
  const toast = useToast()
  const low = sp.get('low') === '1'
  const page = Number(sp.get('page') || 1)
  const res = useAsync((s) => api<Paged<Row>>(`/api/admin/inventory${qs({ low_stock: low, page })}`, { signal: s }), [low, page])
  const [row, setRow] = useState<Row | null>(null)
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const hist = useAsync((s) => (row ? api<Hist[]>(`/api/admin/inventory/${row.product_id}/history`, { signal: s }) : Promise.resolve([] as Hist[])), [row?.product_id])

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    const d = Number(delta)
    if (!Number.isInteger(d) || d === 0) { setErr('Enter a whole number other than 0 (negative removes stock).'); return }
    if (reason.trim().length < 3) { setErr('Enter a reason (for your records).'); return }
    setBusy(true)
    try { const r = await api<{ quantity: number }>(`/api/admin/inventory/${row!.product_id}/adjust`, { method: 'POST', body: { delta: d, reason } }); toast(`Stock is now ${r.quantity}`); setDelta(''); setReason(''); res.reload(); hist.reload(); setRow({ ...row!, quantity: r.quantity }) }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Failed') } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title="Inventory" sub="Stock is reduced automatically when customers order. Adjust here for deliveries, damage or counts." actions={<label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={low} onChange={(e) => setSp(e.target.checked ? { low: '1' } : {})} /> Low stock only</label>} />
      {res.loading ? <PageLoader /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.items.length === 0 ? <EmptyState title={low ? 'No low-stock items' : 'No products yet'} /> : (
        <><div className="card overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-charcoal-100 bg-charcoal-50 text-xs uppercase tracking-wider text-charcoal-500"><tr><th className="p-3">Bike</th><th className="p-3">SKU</th><th className="p-3">In stock</th><th className="p-3">Alert at</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-charcoal-100">{res.data!.items.map((r) => <tr key={r.product_id}><td className="p-3 font-semibold">{r.name}</td><td className="p-3 font-mono text-xs">{r.sku}</td><td className="p-3 text-base font-bold">{r.quantity}</td><td className="p-3">{r.threshold}</td><td className="p-3"><Badge tone={r.status === 'out_of_stock' ? 'red' : r.status === 'low_stock' ? 'amber' : 'green'}>{r.status.replace(/_/g, ' ')}</Badge></td><td className="p-3 text-right"><Button variant="outline" className="!px-3 !py-1.5" onClick={() => { setRow(r); setErr('') }}>Adjust</Button></td></tr>)}</tbody></table></div>
          <Pagination page={res.data!.page} pages={res.data!.pages} onChange={(p) => setSp({ ...(low ? { low: '1' } : {}), page: String(p) })} /></>)}
      <Modal open={!!row} onClose={() => setRow(null)} title={`Adjust stock: ${row?.name ?? ''}`} wide>
        <p className="text-sm text-charcoal-500">Currently <strong>{row?.quantity}</strong> in stock.</p>
        <form onSubmit={submit} noValidate className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end"><Input label="Change (+/−)" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 5 or -2" /><Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="New shipment, damaged…" /><Button type="submit" loading={busy}>Apply</Button></form>
        {err && <div className="mt-3"><Alert>{err}</Alert></div>}
        <h3 className="mt-6 text-sm font-bold">Recent changes</h3>
        <ul className="mt-2 max-h-48 divide-y divide-charcoal-100 overflow-y-auto text-sm">{(hist.data ?? []).map((h, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span>{h.reason}<span className="block text-xs text-charcoal-400">{formatDate(h.created_at)}</span></span><span className="whitespace-nowrap font-semibold">{h.delta > 0 ? '+' : ''}{h.delta} → {h.quantity_after}</span></li>)}</ul>
      </Modal>
    </>
  )
}
