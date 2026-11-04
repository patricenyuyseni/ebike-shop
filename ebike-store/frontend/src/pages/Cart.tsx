import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Alert, Button, EmptyState, LinkButton, PageLoader } from '../components/ui'
import { BikeIllustration } from '../components/BikeIllustration'
import { useCart } from '../context/Cart'
import { useToast } from '../context/Toast'
import { ApiError } from '../lib/api'
import { formatMoney, optimizeImage } from '../lib/format'

export default function CartPage() {
  const { cart, loading, setQty, remove } = useCart()
  const toast = useToast()
  const [busyId, setBusyId] = useState<number | null>(null)

  async function run(id: number, fn: () => Promise<void>) {
    setBusyId(id)
    try { await fn() } catch (e) { toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error') } finally { setBusyId(null) }
  }
  if (loading) return <PageLoader label="Loading your cart…" />
  const items = cart?.items ?? []

  return (
    <div className="container-x py-10">
      <Seo title="Your Cart" noindex />
      <h1 className="text-3xl font-extrabold">Your cart</h1>
      {items.length === 0 ? (
        <div className="mt-8"><EmptyState title="Your cart is empty" text="Find an electric bike you love and add it here." action={<LinkButton to="/shop">Shop bikes</LinkButton>} /></div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <ul className="space-y-4" aria-label="Cart items">
            {items.map((i) => (
              <li key={i.product_id} className="card flex gap-4 p-4 sm:p-5">
                <Link to={i.slug ? `/product/${i.slug}` : '#'} className="h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-charcoal-50 sm:h-28 sm:w-36">
                  {i.image_url ? <img src={optimizeImage(i.image_url, 300) ?? ''} alt={i.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-2 text-charcoal-300"><BikeIllustration className="w-full" /></div>}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex justify-between gap-3">
                    <h2 className="text-base font-bold sm:text-lg">{i.slug ? <Link to={`/product/${i.slug}`} className="hover:text-volt-700">{i.name}</Link> : i.name}</h2>
                    <p className="whitespace-nowrap font-extrabold">{formatMoney(i.line_total_minor, cart!.currency)}</p>
                  </div>
                  <p className="text-sm text-charcoal-500">{formatMoney(i.unit_price_minor, cart!.currency)} each</p>
                  {i.issue && <p role="alert" className="mt-1 text-sm font-medium text-red-600">{i.issue}</p>}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="inline-flex items-center rounded-lg border border-charcoal-200" role="group" aria-label={`Quantity for ${i.name}`}>
                      <button className="px-3 py-1.5 text-lg hover:bg-charcoal-50 disabled:opacity-40" aria-label="Decrease quantity" disabled={busyId === i.product_id || i.quantity <= 1} onClick={() => run(i.product_id, () => setQty(i.product_id, i.quantity - 1))}>−</button>
                      <span className="min-w-8 text-center text-sm font-semibold" aria-live="polite">{i.quantity}</span>
                      <button className="px-3 py-1.5 text-lg hover:bg-charcoal-50 disabled:opacity-40" aria-label="Increase quantity" disabled={busyId === i.product_id || i.quantity >= Math.min(i.available, 10)} onClick={() => run(i.product_id, () => setQty(i.product_id, i.quantity + 1))}>+</button>
                    </div>
                    <button className="text-sm font-medium text-red-600 hover:underline" disabled={busyId === i.product_id} onClick={() => run(i.product_id, () => remove(i.product_id))}>Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <aside className="card h-fit p-6 lg:sticky lg:top-24" aria-label="Order summary">
            <h2 className="text-lg font-bold">Order summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-charcoal-500">Items ({cart!.item_count})</dt><dd className="font-semibold">{formatMoney(cart!.subtotal_minor, cart!.currency)}</dd></div>
              <div className="flex justify-between text-charcoal-500"><dt>Shipping &amp; taxes</dt><dd>Calculated at checkout</dd></div>
            </dl>
            <div className="mt-4 flex justify-between border-t border-charcoal-100 pt-4 text-lg font-extrabold"><span>Subtotal</span><span>{formatMoney(cart!.subtotal_minor, cart!.currency)}</span></div>
            {!cart!.checkout_ready && <div className="mt-4"><Alert kind="warning">Some items need your attention before you can check out.</Alert></div>}
            <LinkButton to="/checkout" className={`mt-5 w-full !py-3 ${cart!.checkout_ready ? '' : 'pointer-events-none opacity-50'}`} aria-disabled={!cart!.checkout_ready}>Proceed to checkout</LinkButton>
            <Link to="/shop" className="mt-3 block text-center text-sm text-charcoal-500 hover:underline">Continue shopping</Link>
            <Button variant="outline" className="hidden" />
          </aside>
        </div>
      )}
    </div>
  )
}
