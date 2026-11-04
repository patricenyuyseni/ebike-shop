import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/Cart'
import { useToast } from '../context/Toast'
import { ApiError } from '../lib/api'
import { discountPercent, formatMoney, optimizeImage } from '../lib/format'
import type { ProductDetailData } from '../lib/types'
import { BikeIllustration } from './BikeIllustration'
import { Alert, Badge, Button } from './ui'

const SPEC_ROWS: [string, (s: NonNullable<ProductDetailData['specs']>) => string | null][] = [
  ['Motor power', (s) => (s.motor_power_w != null ? `${s.motor_power_w} W` : null)],
  ['Battery capacity', (s) => (s.battery_wh != null ? `${s.battery_wh} Wh` : null)],
  ['Advertised range', (s) => (s.range_km != null ? `up to ${s.range_km} km` : null)],
  ['Max assisted speed', (s) => (s.max_speed_kmh != null ? `${s.max_speed_kmh} km/h` : null)],
  ['Charging time', (s) => (s.charge_hours != null ? `${s.charge_hours} hours` : null)],
  ['Frame material', (s) => s.frame_material],
  ['Wheel size', (s) => s.wheel_size],
  ['Bike weight', (s) => (s.weight_kg != null ? `${s.weight_kg} kg` : null)],
  ['Brakes', (s) => s.brakes],
  ['Suspension', (s) => s.suspension],
  ['Available colours', (s) => (s.colors.length ? s.colors.join(', ') : null)],
  ['Warranty', (s) => s.warranty],
]

export function ProductView({ p, preview }: { p: ProductDetailData; preview?: boolean }) {
  const { add } = useCart()
  const toast = useToast()
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(0)
  const imgs = p.images
  const main = optimizeImage(imgs[active]?.url ?? p.image_url, 1000)
  const off = discountPercent(p.price_minor, p.original_price_minor)
  const out = p.stock_status === 'out_of_stock'
  const max = Math.max(1, Math.min(p.available_quantity, 10))
  const rows = p.specs ? SPEC_ROWS.map(([l, f]) => [l, f(p.specs!)] as const).filter(([, v]) => v) : []

  async function addToCart() {
    setBusy(true)
    try { await add(p.id, qty); toast(`${qty} × ${p.name} added to your cart`) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not add to cart', 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div>
        <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-charcoal-100 bg-charcoal-50">
          {main ? <img src={main} alt={imgs[active]?.alt_text ?? p.name} width={1000} height={750} fetchPriority="high" className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center p-10 text-charcoal-300"><BikeIllustration className="w-full max-w-sm" /></div>}
        </div>
        {imgs.length > 1 && (
          <ul className="mt-3 grid grid-cols-5 gap-2" aria-label="Product images">
            {imgs.map((im, i) => (
              <li key={im.id}><button onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} aria-current={i === active} className={`aspect-square w-full overflow-hidden rounded-lg border-2 ${i === active ? 'border-volt-500' : 'border-transparent'}`}>
                <img src={optimizeImage(im.url, 160) ?? ''} alt="" loading="lazy" className="h-full w-full object-cover" /></button></li>
            ))}
          </ul>
        )}
      </div>

      <div>
        {p.category && <Link to={`/shop?category=${p.category.slug}`} className="text-xs font-bold uppercase tracking-widest text-volt-700 hover:underline">{p.category.name}</Link>}
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{p.name}</h1>
        <p className="mt-1 text-xs text-charcoal-400">SKU: {p.sku}</p>
        <div className="mt-5 flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-extrabold">{formatMoney(p.price_minor, p.currency)}</span>
          {p.original_price_minor && p.original_price_minor > p.price_minor && <span className="text-lg text-charcoal-400 line-through">{formatMoney(p.original_price_minor, p.currency)}</span>}
          {off && <Badge tone="dark">Save {off}%</Badge>}
        </div>
        <p className="mt-3">{out ? <Badge tone="red">Out of stock</Badge> : p.stock_status === 'low_stock' ? <Badge tone="amber">Only {p.available_quantity} left</Badge> : <Badge tone="green">In stock</Badge>}</p>
        <div className="mt-6 whitespace-pre-line leading-relaxed text-charcoal-600">{p.description || 'No description yet.'}</div>

        {preview ? <div className="mt-6"><Alert kind="info">Preview mode: purchasing is disabled.</Alert></div> : (
          <div className="mt-8 flex flex-wrap items-end gap-3">
            <div><label htmlFor="qty" className="label">Quantity</label>
              <select id="qty" className="field !w-24" value={qty} disabled={out} onChange={(e) => setQty(Number(e.target.value))}>{Array.from({ length: max }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></div>
            <Button onClick={addToCart} loading={busy} disabled={out} className="!px-8 !py-3 text-base">{out ? 'Sold out' : 'Add to cart'}</Button>
          </div>
        )}
        <ul className="mt-6 space-y-1 text-sm text-charcoal-500"><li>🔒 Secure checkout, we never store card details</li><li>📦 Live stock levels</li></ul>
      </div>

      {rows.length > 0 && (
        <section className="lg:col-span-2" aria-labelledby="specs-h">
          <h2 id="specs-h" className="text-2xl font-extrabold">Technical specifications</h2>
          <dl className="mt-4 grid overflow-hidden rounded-2xl border border-charcoal-100 sm:grid-cols-2">
            {rows.map(([l, v], i) => <div key={l} className={`flex justify-between gap-4 px-5 py-3.5 text-sm ${i % 4 < 2 ? 'bg-charcoal-50' : 'bg-white'}`}><dt className="text-charcoal-500">{l}</dt><dd className="text-right font-semibold text-charcoal-900">{v}</dd></div>)}
          </dl>
        </section>
      )}
    </div>
  )
}
