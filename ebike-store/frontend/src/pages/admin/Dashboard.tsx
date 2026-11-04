import { Link } from 'react-router-dom'
import { Badge, ErrorState, PageLoader } from '../../components/ui'
import { api } from '../../lib/api'
import { formatDate, formatMoney, STATUS_LABELS } from '../../lib/format'
import type { Order } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHead } from './AdminLayout'

interface Stats { currency: string; product_count: number; published_count: number; pending_orders: number; awaiting_payment: number; low_stock_count: number; revenue_minor: number; low_stock: { id: number; name: string; sku: string; quantity: number; threshold: number }[]; recent_orders: Order[] }

export default function Dashboard() {
  const res = useAsync((s) => api<Stats>('/api/admin/dashboard', { signal: s }), [])
  if (res.loading) return <PageLoader />
  if (res.error || !res.data) return <ErrorState message={res.error?.message ?? 'Error'} onRetry={res.reload} />
  const d = res.data
  const cards = [['Products', d.product_count, '/admin/products'], ['Published', d.published_count, '/admin/products?status=published'], ['Orders to fulfil', d.pending_orders, '/admin/orders?status=paid'], ['Awaiting payment', d.awaiting_payment, '/admin/orders?status=pending_payment'], ['Low-stock items', d.low_stock_count, '/admin/inventory?low=1'], ['Revenue (verified payments)', formatMoney(d.revenue_minor, d.currency), '/admin/orders']] as const
  return (
    <>
      <PageHead title="Dashboard" sub="Live numbers from your database" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([l, v, to]) => <Link key={l} to={to} className="card p-5 transition hover:border-volt-500"><p className="text-sm text-charcoal-500">{l}</p><p className="mt-1 text-2xl font-extrabold">{v}</p></Link>)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="card p-5" aria-labelledby="ls"><h2 id="ls" className="font-bold">Low stock</h2>
          {d.low_stock.length === 0 ? <p className="mt-3 text-sm text-charcoal-500">Everything is well stocked.</p> : <ul className="mt-3 divide-y divide-charcoal-100 text-sm">{d.low_stock.map((p) => <li key={p.id} className="flex items-center justify-between py-2"><Link className="font-medium hover:text-volt-700" to={`/admin/products/${p.id}`}>{p.name}<span className="block text-xs text-charcoal-400">{p.sku}</span></Link><Badge tone={p.quantity === 0 ? 'red' : 'amber'}>{p.quantity} left</Badge></li>)}</ul>}</section>
        <section className="card p-5" aria-labelledby="ro"><h2 id="ro" className="font-bold">Recent orders</h2>
          {d.recent_orders.length === 0 ? <p className="mt-3 text-sm text-charcoal-500">No orders yet.</p> : <ul className="mt-3 divide-y divide-charcoal-100 text-sm">{d.recent_orders.map((o) => <li key={o.number} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link className="font-medium hover:text-volt-700" to={`/admin/orders/${o.number}`}>{o.number}<span className="block text-xs text-charcoal-400">{formatDate(o.created_at)} · {o.customer_name}</span></Link><Badge tone={o.status === 'cancelled' ? 'red' : o.status === 'pending_payment' ? 'amber' : 'green'}>{STATUS_LABELS[o.status] ?? o.status}</Badge><span className="font-semibold">{formatMoney(o.total_minor, o.currency)}</span></li>)}</ul>}</section>
      </div>
    </>
  )
}
