import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, ErrorState, Input, LinkButton, PageLoader, Select, Textarea } from '../../components/ui'
import { useToast } from '../../context/Toast'
import { api, ApiError } from '../../lib/api'
import type { AdminProduct } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHead } from './AdminLayout'
import { ImageManager } from './ImageManager'
import type { Errors } from '../../lib/validate'

interface Cat { id: number; name: string; is_archived: boolean }
const EMPTY = { name: '', description: '', sku: '', price: '', original: '', category_id: '', stock: '0', threshold: '3', is_published: false, is_featured: false, motor: '', battery: '', range: '', speed: '', charge: '', frame: '', wheel: '', weight: '', brakes: '', suspension: '', colors: '', warranty: '' }
type F = typeof EMPTY
const num = (v: string) => (v.trim() === '' ? null : Number(v))

export default function ProductForm() {
  const { id } = useParams()
  const isNew = !id
  const nav = useNavigate()
  const toast = useToast()
  const [f, setF] = useState<F>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cats = useAsync((s) => api<Cat[]>('/api/admin/categories', { signal: s }), [])
  const prod = useAsync((s) => (isNew ? Promise.resolve(null) : api<AdminProduct>(`/api/admin/products/${id}`, { signal: s })), [id])

  useEffect(() => {
    const p = prod.data; if (!p) return
    const s = p.specs
    setF({ name: p.name, description: p.description, sku: p.sku, price: String(p.price_minor), original: p.original_price_minor ? String(p.original_price_minor) : '', category_id: p.category_id ? String(p.category_id) : '', stock: String(p.stock_quantity), threshold: String(p.low_stock_threshold), is_published: p.is_published, is_featured: p.is_featured,
      motor: s?.motor_power_w?.toString() ?? '', battery: s?.battery_wh?.toString() ?? '', range: s?.range_km?.toString() ?? '', speed: s?.max_speed_kmh?.toString() ?? '', charge: s?.charge_hours?.toString() ?? '', frame: s?.frame_material ?? '', wheel: s?.wheel_size ?? '', weight: s?.weight_kg?.toString() ?? '', brakes: s?.brakes ?? '', suspension: s?.suspension ?? '', colors: s?.colors.join(', ') ?? '', warranty: s?.warranty ?? '' })
  }, [prod.data])

  const set = (k: keyof F) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  function validate(): Errors {
    const e: Errors = {}
    if (f.name.trim().length < 2) e.name = 'Enter a name.'
    if (!/^[A-Za-z0-9._-]{2,60}$/.test(f.sku)) e.sku = 'SKU: 2–60 letters, numbers, dot, dash or underscore (no spaces).'
    const price = Number(f.price)
    if (!Number.isInteger(price) || price <= 0) e.price = 'Enter a whole number greater than 0.'
    if (f.original && (!Number.isInteger(Number(f.original)) || Number(f.original) < price)) e.original = 'Must be a whole number at least equal to the price.'
    if (!Number.isInteger(Number(f.stock)) || Number(f.stock) < 0) e.stock = 'Enter 0 or more.'
    if (!Number.isInteger(Number(f.threshold)) || Number(f.threshold) < 0) e.threshold = 'Enter 0 or more.'
    for (const [k, l] of [['motor', 'Motor'], ['battery', 'Battery'], ['range', 'Range'], ['speed', 'Speed'], ['charge', 'Charge time'], ['weight', 'Weight']] as const) if (f[k] && (isNaN(Number(f[k])) || Number(f[k]) < 0)) e[k] = `${l} must be a positive number.`
    return e
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault(); setFormErr('')
    const v = validate(); setErrors(v)
    if (Object.keys(v).length) { setFormErr('Please fix the highlighted fields.'); return }
    const body = { name: f.name, description: f.description, sku: f.sku, price_minor: Number(f.price), original_price_minor: f.original ? Number(f.original) : null, category_id: f.category_id ? Number(f.category_id) : null, stock_quantity: Number(f.stock), low_stock_threshold: Number(f.threshold), is_published: f.is_published, is_featured: f.is_featured,
      specs: { motor_power_w: num(f.motor), battery_wh: num(f.battery), range_km: num(f.range), max_speed_kmh: num(f.speed), charge_hours: num(f.charge), frame_material: f.frame || null, wheel_size: f.wheel || null, weight_kg: num(f.weight), brakes: f.brakes || null, suspension: f.suspension || null, colors: f.colors.split(',').map((c) => c.trim()).filter(Boolean), warranty: f.warranty || null } }
    setBusy(true)
    try {
      if (isNew) { const p = await api<AdminProduct>('/api/admin/products', { method: 'POST', body }); toast('Bike created. Now add images below.'); nav(`/admin/products/${p.id}`, { replace: true }) }
      else { await api(`/api/admin/products/${id}`, { method: 'PUT', body }); toast('Changes saved'); prod.reload() }
    } catch (x) { if (x instanceof ApiError) { setFormErr(x.message); setErrors(Object.fromEntries(Object.entries(x.fieldErrors).map(([k, m]) => [k.replace('specs.', '').replace('_minor', ''), m]))) } else setFormErr('Something went wrong.') } finally { setBusy(false) }
  }

  if (!isNew && prod.loading && !prod.data) return <PageLoader />
  if (prod.error) return <ErrorState message={prod.error.message} onRetry={prod.reload} />
  const catOptions = (cats.data ?? []).filter((c) => !c.is_archived || String(c.id) === f.category_id)

  return (
    <>
      <PageHead title={isNew ? 'Add a bike' : `Edit: ${prod.data?.name ?? ''}`} sub={isNew ? 'Fill in the details, save, then upload images.' : prod.data?.is_published ? 'Published: visible in the shop' : 'Draft: hidden from customers'}
        actions={!isNew && <><LinkButton variant="outline" to={`/admin/products/${id}/preview`}>Preview</LinkButton><LinkButton variant="outline" to="/admin/products">Back to list</LinkButton></>} />
      <form onSubmit={submit} noValidate className="space-y-6">
        <section className="card grid gap-4 p-6 sm:grid-cols-2" aria-labelledby="basic"><h2 id="basic" className="text-lg font-bold sm:col-span-2">Basics</h2>
          <Input label="Name" required value={f.name} onChange={set('name')} error={errors.name} className="sm:col-span-2" />
          <Textarea label="Description" rows={6} value={f.description} onChange={set('description')} error={errors.description} className="sm:col-span-2" />
          <Input label="SKU" required value={f.sku} onChange={set('sku')} error={errors.sku} />
          <Select label="Category" value={f.category_id} onChange={set('category_id')} error={errors.category_id}><option value="">No category</option>{catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Input label="Selling price (USD)" required inputMode="numeric" value={f.price} onChange={set('price')} error={errors.price} />
          <Input label="Original price (USD, optional)" inputMode="numeric" hint="Shown crossed out to display a discount" value={f.original} onChange={set('original')} error={errors.original} />
          <Input label="Stock quantity" required inputMode="numeric" value={f.stock} onChange={set('stock')} error={errors.stock} />
          <Input label="Low-stock alert at" inputMode="numeric" value={f.threshold} onChange={set('threshold')} error={errors.threshold} />
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} /> Published (visible in the shop)</label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.is_featured} onChange={(e) => setF({ ...f, is_featured: e.target.checked })} /> Featured on the homepage</label>
        </section>
        <section className="card grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3" aria-labelledby="specs"><h2 id="specs" className="text-lg font-bold sm:col-span-2 lg:col-span-3">Technical specifications</h2>
          <Input label="Motor power (W)" inputMode="decimal" value={f.motor} onChange={set('motor')} error={errors.motor} />
          <Input label="Battery capacity (Wh)" inputMode="decimal" value={f.battery} onChange={set('battery')} error={errors.battery} />
          <Input label="Advertised range (km)" inputMode="decimal" value={f.range} onChange={set('range')} error={errors.range} />
          <Input label="Max assisted speed (km/h)" inputMode="decimal" value={f.speed} onChange={set('speed')} error={errors.speed} />
          <Input label="Charging time (hours)" inputMode="decimal" value={f.charge} onChange={set('charge')} error={errors.charge} />
          <Input label="Bike weight (kg)" inputMode="decimal" value={f.weight} onChange={set('weight')} error={errors.weight} />
          <Input label="Frame material" value={f.frame} onChange={set('frame')} />
          <Input label="Wheel size" value={f.wheel} onChange={set('wheel')} />
          <Input label="Brakes" value={f.brakes} onChange={set('brakes')} />
          <Input label="Suspension" value={f.suspension} onChange={set('suspension')} />
          <Input label="Available colours" hint="Separate with commas: Black, Green" value={f.colors} onChange={set('colors')} />
          <Input label="Warranty" value={f.warranty} onChange={set('warranty')} />
        </section>
        {formErr && <Alert>{formErr}</Alert>}
        <div className="flex gap-3"><Button type="submit" loading={busy} className="!px-8">{isNew ? 'Create bike' : 'Save changes'}</Button></div>
      </form>
      <div className="mt-6">
        {isNew ? <Alert kind="info">Save the bike first, then you can upload images.</Alert> : prod.data && <ImageManager productId={prod.data.id} images={prod.data.images} onChange={prod.reload} />}
      </div>
    </>
  )
}
