import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, LinkButton, PageLoader, Pagination, Select } from '../../components/ui'
import { useToast } from '../../context/Toast'
import { api, ApiError, qs } from '../../lib/api'
import { formatMoney, optimizeImage } from '../../lib/format'
import type { AdminProduct, Paged } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHead } from './AdminLayout'

interface Cat { id: number; name: string }

export default function Products() {
  const [sp, setSp] = useSearchParams()
  const toast = useToast()
  const g = (k: string) => sp.get(k) ?? ''
  const set = (p: Record<string, string>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(p)) v ? n.set(k, v) : n.delete(k); if (!('page' in p)) n.delete('page'); setSp(n) }
  const [q, setQ] = useState(g('q'))
  const cats = useAsync((s) => api<Cat[]>('/api/admin/categories', { signal: s }), [])
  const res = useAsync((s) => api<Paged<AdminProduct>>(`/api/admin/products${qs({ q: g('q'), status: g('status'), category_id: g('category_id'), low_stock: g('low_stock') === '1', page: g('page') || 1 })}`, { signal: s }), [sp.toString()])
  const [del, setDel] = useState<AdminProduct | null>(null)
  const [busy, setBusy] = useState(false)

  async function flag(p: AdminProduct, body: object, msg: string) {
    try { await api(`/api/admin/products/${p.id}/flags`, { method: 'PATCH', body }); toast(msg); res.reload() } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed', 'error') }
  }
  async function remove() {
    if (!del) return; setBusy(true)
    try { const r = await api<{ result: string }>(`/api/admin/products/${del.id}`, { method: 'DELETE' }); toast(r.result === 'archived' ? 'Product archived (it has past orders, so it was kept for history)' : 'Product deleted'); setDel(null); res.reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed', 'error') } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title="Products" actions={<LinkButton to="/admin/products/new">+ Add bike</LinkButton>} />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <form className="sm:col-span-2" role="search" onSubmit={(e) => { e.preventDefault(); set({ q }) }}><label className="label" htmlFor="pq">Search name or SKU</label><div className="flex gap-2"><input id="pq" className="field" value={q} onChange={(e) => setQ(e.target.value)} /><Button type="submit" variant="dark">Search</Button></div></form>
        <Select label="Status" value={g('status')} onChange={(e) => set({ status: e.target.value })}><option value="">All active</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select>
        <Select label="Category" value={g('category_id')} onChange={(e) => set({ category_id: e.target.value })}><option value="">All</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <label className="flex items-end gap-2 pb-2.5 text-sm font-medium"><input type="checkbox" checked={g('low_stock') === '1'} onChange={(e) => set({ low_stock: e.target.checked ? '1' : '' })} /> Low stock only</label>
      </div>
      {res.loading ? <PageLoader /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.items.length === 0 ? <EmptyState title="No products found" text="Add your first electric bike to get started." action={<LinkButton to="/admin/products/new">Add bike</LinkButton>} /> : (
        <>
          <div className="card overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-charcoal-100 bg-charcoal-50 text-xs uppercase tracking-wider text-charcoal-500"><tr><th className="p-3">Bike</th><th className="p-3">SKU</th><th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-charcoal-100">{res.data!.items.map((p) => (
              <tr key={p.id}>
                <td className="p-3"><div className="flex items-center gap-3"><div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-charcoal-100">{p.image_url && <img src={optimizeImage(p.image_url, 160) ?? ''} alt="" className="h-full w-full object-cover" />}</div><div><Link to={`/admin/products/${p.id}`} className="font-semibold hover:text-volt-700">{p.name}</Link><p className="text-xs text-charcoal-400">{p.category?.name ?? 'No category'}{p.is_featured && ' · ★ Featured'}</p></div></div></td>
                <td className="p-3 font-mono text-xs">{p.sku}</td>
                <td className="p-3">{formatMoney(p.price_minor, p.currency)}</td>
                <td className="p-3"><Badge tone={p.stock_quantity === 0 ? 'red' : p.stock_quantity <= p.low_stock_threshold ? 'amber' : 'green'}>{p.stock_quantity}</Badge></td>
                <td className="p-3">{p.is_archived ? <Badge>Archived</Badge> : p.is_published ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Draft</Badge>}</td>
                <td className="p-3"><div className="flex flex-wrap justify-end gap-1.5">
                  <LinkButton to={`/admin/products/${p.id}`} variant="outline" className="!px-3 !py-1.5">Edit</LinkButton>
                  {!p.is_archived && <Button variant="outline" className="!px-3 !py-1.5" onClick={() => flag(p, { is_published: !p.is_published }, p.is_published ? 'Unpublished' : 'Published')}>{p.is_published ? 'Unpublish' : 'Publish'}</Button>}
                  {!p.is_archived && <Button variant="outline" className="!px-3 !py-1.5" onClick={() => flag(p, { is_featured: !p.is_featured }, p.is_featured ? 'Removed from featured' : 'Marked as featured')}>{p.is_featured ? 'Unfeature' : 'Feature'}</Button>}
                  {p.is_archived ? <Button variant="outline" className="!px-3 !py-1.5" onClick={() => flag(p, { is_archived: false }, 'Restored as draft')}>Restore</Button> : <Button variant="outline" className="!px-3 !py-1.5 !text-red-600" onClick={() => setDel(p)}>Delete</Button>}
                </div></td>
              </tr>))}</tbody></table></div>
          <Pagination page={res.data!.page} pages={res.data!.pages} onChange={(p) => set({ page: String(p) })} />
        </>)}
      <ConfirmDialog open={!!del} danger loading={busy} title="Delete this bike?" text={`"${del?.name}" will be removed. If it has past orders it is archived instead so order history stays intact. This cannot be undone for products without orders.`} confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={remove} />
    </>
  )
}
