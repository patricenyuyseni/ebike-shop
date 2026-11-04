import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Alert, Badge, ErrorState, LinkButton, PageLoader } from '../components/ui'
import { api } from '../lib/api'
import { formatDate, formatMoney, PAYMENT_LABELS, STATUS_LABELS } from '../lib/format'
import type { Order } from '../lib/types'
import { useAsync } from '../lib/useAsync'

export function OrderSummary({ o }: { o: Order }) {
  const c = o.currency
  return (
    <div className="card mt-6 divide-y divide-charcoal-100">
      <ul className="divide-y divide-charcoal-100">{o.items.map((i, k) => <li key={k} className="flex justify-between gap-4 p-5 text-sm"><span><span className="font-semibold">{i.product_name}</span><span className="block text-charcoal-500">SKU {i.sku} · {formatMoney(i.unit_price_minor, c)} × {i.quantity}</span></span><span className="font-semibold">{formatMoney(i.line_total_minor, c)}</span></li>)}</ul>
      <dl className="space-y-1.5 p-5 text-sm">
        <div className="flex justify-between"><dt className="text-charcoal-500">Subtotal</dt><dd>{formatMoney(o.subtotal_minor, c)}</dd></div>
        {o.discount_minor > 0 && <div className="flex justify-between"><dt className="text-charcoal-500">Discount {o.discount_code && `(${o.discount_code})`}</dt><dd>−{formatMoney(o.discount_minor, c)}</dd></div>}
        <div className="flex justify-between"><dt className="text-charcoal-500">Shipping ({o.shipping_method})</dt><dd>{formatMoney(o.shipping_minor, c)}</dd></div>
        {o.tax_minor > 0 && <div className="flex justify-between"><dt className="text-charcoal-500">Tax</dt><dd>{formatMoney(o.tax_minor, c)}</dd></div>}
        <div className="flex justify-between pt-2 text-base font-extrabold"><dt>Total</dt><dd>{formatMoney(o.total_minor, c)}</dd></div>
      </dl>
      <div className="grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div><h3 className="font-bold">Shipping to</h3><address className="mt-1 not-italic text-charcoal-600">{o.shipping_address.full_name}<br />{o.shipping_address.line1}{o.shipping_address.line2 && <>, {o.shipping_address.line2}</>}<br />{o.shipping_address.city}, {o.shipping_address.region} {o.shipping_address.postal_code}<br />{o.shipping_address.country}</address></div>
        {o.tracking?.tracking_number && <div><h3 className="font-bold">Tracking</h3><p className="mt-1 text-charcoal-600">{o.tracking.carrier ?? 'Carrier'}: <span className="font-mono">{o.tracking.tracking_number}</span></p></div>}
      </div>
    </div>
  )
}

/** Shows an order. "Paid" is displayed ONLY when the server says it verified the payment. */
export default function OrderStatus() {
  const { number = '' } = useParams()
  const token = useSearchParams()[0].get('token')
  const res = useAsync((s) => api<Order>(`/api/orders/${number}${token ? `?token=${encodeURIComponent(token)}` : ''}`, { signal: s }), [number, token])
  const status = res.data?.status
  useEffect(() => {
    if (status !== 'pending_payment') return
    const t = setInterval(() => res.reload(), 4000)
    return () => clearInterval(t)
  }, [status, res])

  if (res.loading && !res.data) return <PageLoader label="Loading order…" />
  if (res.error || !res.data) return <div className="container-x py-12"><ErrorState message={res.error?.status === 404 ? 'We could not find that order. If you are a guest, open the link from your checkout.' : (res.error?.message ?? 'Error')} /></div>
  const o = res.data
  const msg = { pending_payment: ['info', 'Waiting for payment confirmation. This page updates automatically once your payment is verified.'], paid: ['success', 'Payment verified. Thank you! We are preparing your order.'], processing: ['success', 'Payment verified. Your order is being prepared.'], shipped: ['success', 'Your order is on its way.'], delivered: ['success', 'Delivered. Enjoy your ride!'], cancelled: ['error', o.payment_status === 'failed' ? 'The payment did not go through, so the order was cancelled and stock released. You can try again from your cart.' : 'This order was cancelled.'], needs_review: ['warning', 'We are reviewing a payment issue on this order. Our team will contact you.'] }[o.status] as ['info' | 'success' | 'error' | 'warning', string] | undefined
  return (
    <div className="container-x max-w-3xl py-10">
      <Seo title={`Order ${o.number}`} noindex />
      <p className="text-sm text-charcoal-500">Placed {formatDate(o.created_at)}</p>
      <h1 className="text-3xl font-extrabold">Order {o.number}</h1>
      <div className="mt-3 flex gap-2"><Badge tone={o.status === 'cancelled' ? 'red' : o.status === 'pending_payment' ? 'amber' : 'green'}>{STATUS_LABELS[o.status] ?? o.status}</Badge><Badge>{PAYMENT_LABELS[o.payment_status] ?? o.payment_status}</Badge></div>
      {msg && <div className="mt-5"><Alert kind={msg[0]}>{msg[1]}</Alert></div>}
      <OrderSummary o={o} />
      <div className="mt-6 flex gap-3"><LinkButton to="/shop" variant="dark">Continue shopping</LinkButton>{!token && <Link to="/account/orders" className="inline-flex items-center text-sm font-semibold text-volt-700 hover:underline">All my orders</Link>}</div>
    </div>
  )
}
