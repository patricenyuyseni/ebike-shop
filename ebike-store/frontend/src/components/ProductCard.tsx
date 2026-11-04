import { Link } from 'react-router-dom'
import { useCart } from '../context/Cart'
import { useToast } from '../context/Toast'
import { ApiError } from '../lib/api'
import { discountPercent, formatMoney, optimizeImage } from '../lib/format'
import type { ProductCardData } from '../lib/types'
import { BikeIllustration } from './BikeIllustration'
import { Badge, Button } from './ui'
import { useState } from 'react'

export function ProductCard({ p }: { p: ProductCardData }) {
  const { add } = useCart()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const off = discountPercent(p.price_minor, p.original_price_minor)
  const out = p.stock_status === 'out_of_stock'
  const img = optimizeImage(p.image_url, 640)

  async function addToCart() {
    setBusy(true)
    try { await add(p.id, 1); toast(`${p.name} added to your cart`) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not add to cart', 'error') }
    finally { setBusy(false) }
  }

  return (
    <article className="group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-xl">
      <Link to={`/product/${p.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-charcoal-50" aria-label={`View ${p.name}`}>
        {img ? <img src={img} alt={p.name} loading="lazy" decoding="async" width={640} height={480} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          : <div className="flex h-full items-center justify-center bg-gradient-to-br from-charcoal-50 to-charcoal-100 p-8 text-charcoal-400"><BikeIllustration className="w-full max-w-[260px]" /></div>}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {off && <Badge tone="dark">-{off}%</Badge>}
          {p.is_featured && <Badge tone="green">Featured</Badge>}
          {out && <Badge tone="red">Sold out</Badge>}
          {p.stock_status === 'low_stock' && <Badge tone="amber">Only {p.available_quantity} left</Badge>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        {p.category && <p className="text-xs font-semibold uppercase tracking-wider text-volt-700">{p.category.name}</p>}
        <h3 className="mt-1 text-lg font-bold leading-snug"><Link to={`/product/${p.slug}`} className="hover:text-volt-700">{p.name}</Link></h3>
        {(p.range_km || p.motor_power_w) && (
          <p className="mt-1 text-sm text-charcoal-500">{[p.range_km && `${p.range_km} km range`, p.motor_power_w && `${p.motor_power_w} W motor`].filter(Boolean).join(' · ')}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="text-xl font-extrabold text-charcoal-950">{formatMoney(p.price_minor, p.currency)}</p>
            {p.original_price_minor && p.original_price_minor > p.price_minor && <p className="text-sm text-charcoal-400 line-through">{formatMoney(p.original_price_minor, p.currency)}</p>}
          </div>
          <Button variant="dark" onClick={addToCart} loading={busy} disabled={out} aria-label={`Add ${p.name} to cart`} className="!px-4">{out ? 'Sold out' : 'Add'}</Button>
        </div>
      </div>
    </article>
  )
}

export function ProductGridSkeleton({ n = 6 }: { n?: number }) {
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">{Array.from({ length: n }, (_, i) => (
    <div key={i} className="card overflow-hidden"><div className="aspect-[4/3] animate-pulse bg-charcoal-100" /><div className="space-y-3 p-5"><div className="h-3 w-1/3 animate-pulse rounded bg-charcoal-100" /><div className="h-5 w-2/3 animate-pulse rounded bg-charcoal-100" /><div className="h-6 w-1/2 animate-pulse rounded bg-charcoal-100" /></div></div>
  ))}</div>
}
