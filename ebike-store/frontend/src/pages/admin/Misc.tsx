import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageLoader, Pagination, Stars, Textarea } from '../../components/ui'
import { useToast } from '../../context/Toast'
import { api, ApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import type { Paged } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHead } from './AdminLayout'

interface Cat { id: number; name: string; slug: string; description: string | null; sort_order: number; is_published: boolean; is_archived: boolean; product_count: number }

export function Categories() {
  const toast = useToast()
  const res = useAsync((s) => api<Cat[]>('/api/admin/categories', { signal: s }), [])
  const [edit, setEdit] = useState<Partial<Cat> | null>(null)
  const [del, setDel] = useState<Cat | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('')
    if ((edit?.name ?? '').trim().length < 2) { setErr('Enter a category name.'); return }
    setBusy(true)
    const body = { name: edit!.name, description: edit!.description || null, sort_order: edit!.sort_order ?? 0, is_published: edit!.is_published ?? true }
    try { if (edit!.id) await api(`/api/admin/categories/${edit!.id}`, { method: 'PUT', body }); else await api('/api/admin/categories', { method: 'POST', body }); toast('Category saved'); setEdit(null); res.reload() }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Failed') } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title="Categories" actions={<Button onClick={() => { setErr(''); setEdit({ is_published: true, sort_order: 0 }) }}>+ Add category</Button>} />
      {res.loading ? <PageLoader /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.length === 0 ? <EmptyState title="No categories yet" text="Create categories like Mountain, Commuter or Folding." /> :
        <div className="card overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-charcoal-100 bg-charcoal-50 text-xs uppercase tracking-wider text-charcoal-500"><tr><th className="p-3">Name</th><th className="p-3">Bikes</th><th className="p-3">Order</th><th className="p-3">Visibility</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-charcoal-100">{res.data!.map((c) => <tr key={c.id}><td className="p-3 font-semibold">{c.name}<span className="block text-xs text-charcoal-400">/{c.slug}</span></td><td className="p-3">{c.product_count}</td><td className="p-3">{c.sort_order}</td><td className="p-3">{c.is_archived ? <Badge>Archived</Badge> : c.is_published ? <Badge tone="green">Visible</Badge> : <Badge tone="amber">Hidden</Badge>}</td>
            <td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" className="!px-3 !py-1.5" onClick={() => { setErr(''); setEdit(c) }}>Edit</Button>{!c.is_archived && <Button variant="outline" className="!px-3 !py-1.5 !text-red-600" onClick={() => setDel(c)}>{c.product_count ? 'Archive' : 'Delete'}</Button>}</div></td></tr>)}</tbody></table></div>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit category' : 'New category'}>
        <form onSubmit={save} noValidate className="space-y-4"><Input label="Name" value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><Textarea label="Description" rows={3} value={edit?.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          <Input label="Display order" inputMode="numeric" value={String(edit?.sort_order ?? 0)} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) || 0 })} />
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={edit?.is_published ?? true} onChange={(e) => setEdit({ ...edit, is_published: e.target.checked })} /> Visible in the shop</label>
          {err && <Alert>{err}</Alert>}<div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div></form>
      </Modal>
      <ConfirmDialog open={!!del} danger title={del?.product_count ? 'Archive category?' : 'Delete category?'} text={del?.product_count ? 'This category has bikes, so it will be hidden (archived) instead of deleted. Its bikes disappear from the shop until moved or the category is restored.' : 'This category has no bikes and will be permanently deleted.'} confirmLabel={del?.product_count ? 'Archive' : 'Delete'} onClose={() => setDel(null)} onConfirm={async () => { try { await api(`/api/admin/categories/${del!.id}`, { method: 'DELETE' }); toast('Done'); res.reload() } catch (x) { toast(x instanceof ApiError ? x.message : 'Failed', 'error') } setDel(null) }} />
    </>
  )
}

interface Disc { id: number; code: string; percent_off: number | null; amount_off_minor: number | null; is_active: boolean; max_uses: number | null; used_count: number }
export function Discounts() {
  const toast = useToast()
  const res = useAsync((s) => api<Disc[]>('/api/admin/discounts', { signal: s }), [])
  const [f, setF] = useState({ code: '', kind: 'percent', value: '', max: '' })
  const [err, setErr] = useState('')
  async function create(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(f.code)) { setErr('Code: 3–40 letters, numbers, dash or underscore.'); return }
    const v = Number(f.value); if (!Number.isInteger(v) || v <= 0 || (f.kind === 'percent' && v > 90)) { setErr(f.kind === 'percent' ? 'Percent must be 1–90.' : 'Enter an amount greater than 0.'); return }
    try { await api('/api/admin/discounts', { method: 'POST', body: { code: f.code, percent_off: f.kind === 'percent' ? v : null, amount_off_minor: f.kind === 'amount' ? v : null, max_uses: f.max ? Number(f.max) : null } }); toast('Discount created'); setF({ code: '', kind: 'percent', value: '', max: '' }); res.reload() }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Failed') }
  }
  return (
    <>
      <PageHead title="Discount codes" />
      <form onSubmit={create} noValidate className="card mb-6 grid gap-3 p-4 sm:grid-cols-5 sm:items-end"><Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /><div><label className="label" htmlFor="dk">Type</label><select id="dk" className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="percent">Percent off</option><option value="amount">Fixed amount (USD)</option></select></div><Input label={f.kind === 'percent' ? 'Percent' : 'Amount'} inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /><Input label="Max uses (optional)" inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /><Button type="submit">Create</Button>{err && <div className="sm:col-span-5"><Alert>{err}</Alert></div>}</form>
      {res.loading ? <PageLoader /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.length === 0 ? <EmptyState title="No discount codes" /> :
        <div className="card overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-charcoal-100 bg-charcoal-50 text-xs uppercase text-charcoal-500"><tr><th className="p-3">Code</th><th className="p-3">Discount</th><th className="p-3">Used</th><th className="p-3">Status</th><th className="p-3" /></tr></thead><tbody className="divide-y divide-charcoal-100">{res.data!.map((d) => <tr key={d.id}><td className="p-3 font-mono font-semibold">{d.code}</td><td className="p-3">{d.percent_off ? `${d.percent_off}%` : `${d.amount_off_minor} USD`}</td><td className="p-3">{d.used_count}{d.max_uses ? ` / ${d.max_uses}` : ''}</td><td className="p-3">{d.is_active ? <Badge tone="green">Active</Badge> : <Badge>Off</Badge>}</td><td className="p-3 text-right"><Button variant="outline" className="!px-3 !py-1.5" onClick={async () => { await api(`/api/admin/discounts/${d.id}/toggle`, { method: 'PATCH' }); res.reload() }}>{d.is_active ? 'Disable' : 'Enable'}</Button></td></tr>)}</tbody></table></div>}
    </>
  )
}

interface Rev { id: number; product_id: number; rating: number; title: string | null; body: string; email: string }
export function Reviews() {
  const toast = useToast()
  const res = useAsync((s) => api<Rev[]>('/api/admin/reviews', { signal: s }), [])
  return (
    <>
      <PageHead title="Review moderation" sub="Reviews come only from verified buyers and appear on the site after you approve them." />
      {res.loading ? <PageLoader /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.length === 0 ? <EmptyState title="No reviews waiting" /> :
        <ul className="space-y-3">{res.data!.map((r) => <li key={r.id} className="card p-5"><Stars value={r.rating} /> <span className="text-xs text-charcoal-400">{r.email}</span>{r.title && <p className="font-semibold">{r.title}</p>}<p className="mt-1 text-sm">{r.body}</p>
          <div className="mt-3 flex gap-2"><Button onClick={async () => { await api(`/api/admin/reviews/${r.id}/approve`, { method: 'POST' }); toast('Approved'); res.reload() }}>Approve</Button><Button variant="outline" className="!text-red-600" onClick={async () => { await api(`/api/admin/reviews/${r.id}`, { method: 'DELETE' }); toast('Deleted'); res.reload() }}>Delete</Button></div></li>)}</ul>}
    </>
  )
}

interface Log { id: number; actor_user_id: number | null; action: string; entity: string | null; entity_id: string | null; detail: unknown; ip: string | null; created_at: string }
export function AuditLog() {
  const [sp, setSp] = useSearchParams()
  const page = Number(sp.get('page') || 1)
  const res = useAsync((s) => api<Paged<Log>>(`/api/admin/audit-logs?page=${page}`, { signal: s }), [page])
  return (
    <>
      <PageHead title="Audit log" sub="Who changed what, and when. Entries cannot be edited from the dashboard." />
      {res.loading ? <PageLoader /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : (
        <><div className="card overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-charcoal-100 bg-charcoal-50 text-xs uppercase text-charcoal-500"><tr><th className="p-3">When</th><th className="p-3">Action</th><th className="p-3">Item</th><th className="p-3">User</th><th className="p-3">IP</th></tr></thead><tbody className="divide-y divide-charcoal-100">{res.data!.items.map((l) => <tr key={l.id}><td className="whitespace-nowrap p-3">{formatDate(l.created_at)} {new Date(l.created_at).toLocaleTimeString()}</td><td className="p-3 font-mono text-xs">{l.action}</td><td className="p-3">{l.entity} {l.entity_id}</td><td className="p-3">{l.actor_user_id ?? 'system'}</td><td className="p-3 text-xs">{l.ip}</td></tr>)}</tbody></table></div>
          <Pagination page={res.data!.page} pages={res.data!.pages} onChange={(p) => setSp({ page: String(p) })} /></>)}
    </>
  )
}
