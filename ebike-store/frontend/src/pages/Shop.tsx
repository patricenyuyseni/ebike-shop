import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard'
import { Seo } from '../components/Seo'
import { Button, EmptyState, ErrorState, Pagination, Select } from '../components/ui'
import { api, qs } from '../lib/api'
import type { Category, Paged, ProductCardData } from '../lib/types'
import { useAsync } from '../lib/useAsync'

export default function Shop() {
  const [sp, setSp] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const get = (k: string) => sp.get(k) ?? ''
  const page = Number(get('page') || 1)
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); if (!('page' in patch)) n.delete('page'); setSp(n) }

  const cats = useAsync((s) => api<Category[]>('/api/categories', { signal: s }), [])
  const params = { q: get('q'), category: get('category'), min_price: get('min_price'), max_price: get('max_price'), min_range_km: get('min_range_km'), in_stock: get('in_stock') === 'true', featured: get('featured') === 'true' ? true : undefined, sort: get('sort') || 'newest', page, page_size: 12 }
  const res = useAsync((s) => api<Paged<ProductCardData>>(`/api/products${qs(params)}`, { signal: s }), [sp.toString()])
  const activeCat = cats.data?.find((c) => c.slug === get('category'))
  const hasFilters = ['q', 'category', 'min_price', 'max_price', 'min_range_km', 'in_stock', 'featured'].some((k) => get(k))
  const [q, setQ] = useState(get('q'))

  const filters = (
    <div className="space-y-6">
      <form role="search" onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() }) }}>
        <label htmlFor="shop-q" className="label">Search</label>
        <div className="flex gap-2"><input id="shop-q" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU or type…" maxLength={100} /><Button type="submit" variant="dark" aria-label="Search">Go</Button></div>
      </form>
      <fieldset><legend className="label">Category</legend>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="cat" checked={!get('category')} onChange={() => set({ category: '' })} /> All bikes</label>
          {(cats.data ?? []).map((c) => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="radio" name="cat" checked={get('category') === c.slug} onChange={() => set({ category: c.slug })} /> {c.name} <span className="text-charcoal-400">({c.product_count})</span></label>)}
        </div>
      </fieldset>
      <fieldset><legend className="label">Price (USD)</legend>
        <div className="flex items-center gap-2">
          <input aria-label="Minimum price" inputMode="numeric" className="field" placeholder="Min" defaultValue={get('min_price')} onBlur={(e) => set({ min_price: e.target.value.replace(/\D/g, '') })} />
          <span>–</span>
          <input aria-label="Maximum price" inputMode="numeric" className="field" placeholder="Max" defaultValue={get('max_price')} onBlur={(e) => set({ max_price: e.target.value.replace(/\D/g, '') })} />
        </div>
      </fieldset>
      <Select label="Minimum range" value={get('min_range_km')} onChange={(e) => set({ min_range_km: e.target.value })}>
        <option value="">Any</option><option value="50">50 km+</option><option value="80">80 km+</option><option value="100">100 km+</option>
      </Select>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={get('in_stock') === 'true'} onChange={(e) => set({ in_stock: e.target.checked ? 'true' : '' })} /> In stock only</label>
      {hasFilters && <Button variant="outline" className="w-full" onClick={() => { setQ(''); setSp(new URLSearchParams()) }}>Clear all filters</Button>}
    </div>
  )

  return (
    <>
      <Seo title={activeCat ? `${activeCat.name} Electric Bikes` : 'Shop Electric Bikes'} description={activeCat?.description ?? 'Browse electric bicycles. Filter by category, price and range.'} />
      <div className="bg-charcoal-950 py-12 text-white"><div className="container-x"><h1 className="text-3xl font-extrabold !text-white sm:text-4xl">{activeCat ? `${activeCat.name} bikes` : 'Shop electric bikes'}</h1>{activeCat?.description && <p className="mt-2 max-w-2xl text-charcoal-300">{activeCat.description}</p>}</div></div>
      <div className="container-x py-8 lg:grid lg:grid-cols-[260px_1fr] lg:gap-10">
        <aside className="mb-6 lg:mb-0" aria-label="Filters">
          <Button variant="outline" className="w-full lg:hidden" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>{showFilters ? 'Hide filters' : 'Show filters'}</Button>
          <div className={`${showFilters ? 'mt-4 block' : 'hidden'} lg:block`}>{filters}</div>
        </aside>
        <section aria-live="polite">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-charcoal-500">{res.loading ? 'Loading…' : `${res.data?.total ?? 0} bike${res.data?.total === 1 ? '' : 's'}`}</p>
            <div className="w-48"><Select label="Sort by" value={get('sort') || 'newest'} onChange={(e) => set({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
              <option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name A–Z</option></Select></div>
          </div>
          {res.loading ? <ProductGridSkeleton /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} />
            : (res.data?.items.length ?? 0) === 0 ? <EmptyState title="No bikes found" text={hasFilters ? 'Try removing a filter or searching for something else.' : 'There are no bikes in the shop yet.'} action={hasFilters ? <Button variant="dark" onClick={() => { setQ(''); setSp(new URLSearchParams()) }}>Clear filters</Button> : undefined} />
            : <><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{res.data!.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
              <Pagination page={res.data!.page} pages={res.data!.pages} onChange={(p) => { set({ page: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }} /></>}
        </section>
      </div>
    </>
  )
}
