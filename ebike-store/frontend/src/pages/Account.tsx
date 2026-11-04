import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Alert, Badge, Button, ConfirmDialog, EmptyState, ErrorState, Input, LinkButton, Modal, PageLoader, Select } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { api, ApiError } from '../lib/api'
import { COUNTRY_NAMES, useStoreConfig } from '../lib/config'
import { formatDate, formatMoney, STATUS_LABELS } from '../lib/format'
import type { Address, Order } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { isPhone, validateAddress, type Errors } from '../lib/validate'

export default function Account() {
  const { user } = useAuth()
  const toast = useToast()
  const cfg = useStoreConfig()
  const [profile, setProfile] = useState({ full_name: user?.full_name ?? '', phone: user?.phone ?? '' })
  const [pErr, setPErr] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const addrs = useAsync((s) => api<Address[]>('/api/account/addresses', { signal: s }), [])
  const [modal, setModal] = useState(false)
  const [del, setDel] = useState<Address | null>(null)
  const blank = { label: '', full_name: user?.full_name ?? '', phone: user?.phone ?? '', line1: '', line2: '', city: '', region: '', country: cfg.countries[0] ?? 'CM', postal_code: '' }
  const [a, setA] = useState(blank)
  const [aErr, setAErr] = useState<Errors>({})
  const [aBusy, setABusy] = useState(false)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    const v: Errors = {}
    if (profile.full_name.trim().length < 2) v.full_name = 'Enter your name.'
    if (profile.phone && !isPhone(profile.phone)) v.phone = 'Enter a valid phone number.'
    setPErr(v); if (Object.keys(v).length) return
    setSaving(true)
    try { await api('/api/account/profile', { method: 'PUT', body: { full_name: profile.full_name, phone: profile.phone || null } }); toast('Profile saved') }
    catch (x) { toast(x instanceof ApiError ? x.message : 'Could not save', 'error') } finally { setSaving(false) }
  }
  async function saveAddress(e: FormEvent) {
    e.preventDefault()
    const v = validateAddress(a, false); setAErr(v); if (Object.keys(v).length) return
    setABusy(true)
    try { await api('/api/account/addresses', { method: 'POST', body: { ...a, label: a.label || null, line2: a.line2 || null, postal_code: a.postal_code || null } }); setModal(false); setA(blank); addrs.reload(); toast('Address saved') }
    catch (x) { if (x instanceof ApiError) setAErr(x.fieldErrors); toast(x instanceof ApiError ? x.message : 'Could not save', 'error') } finally { setABusy(false) }
  }
  const sa = (k: string) => (e: { target: { value: string } }) => setA({ ...a, [k]: e.target.value })

  return (
    <div className="container-x py-10">
      <Seo title="My account" noindex />
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-extrabold">My account</h1><p className="text-sm text-charcoal-500">{user?.email}</p></div><LinkButton to="/account/orders" variant="dark">Order history</LinkButton></div>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="pf"><h2 id="pf" className="text-lg font-bold">Profile</h2>
          <form onSubmit={saveProfile} noValidate className="mt-4 space-y-4">
            <Input label="Full name" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} error={pErr.full_name} />
            <Input label="Phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} error={pErr.phone} />
            <Button type="submit" loading={saving}>Save profile</Button>
          </form></section>
        <section className="card p-6" aria-labelledby="ad"><div className="flex items-center justify-between"><h2 id="ad" className="text-lg font-bold">Saved addresses</h2><Button variant="outline" onClick={() => { setA(blank); setAErr({}); setModal(true) }}>Add address</Button></div>
          <div className="mt-4">{addrs.loading ? <PageLoader /> : addrs.error ? <ErrorState message={addrs.error.message} onRetry={addrs.reload} /> : (addrs.data ?? []).length === 0 ? <EmptyState title="No saved addresses" text="Add one to speed up checkout." /> :
            <ul className="space-y-3">{addrs.data!.map((x) => <li key={x.id} className="flex justify-between gap-3 rounded-xl border border-charcoal-100 p-4 text-sm"><address className="not-italic"><strong>{x.label || x.full_name}</strong><br />{x.line1}{x.line2 && `, ${x.line2}`}<br />{x.city}, {x.region} · {COUNTRY_NAMES[x.country] ?? x.country}</address><button className="self-start text-sm font-medium text-red-600 hover:underline" onClick={() => setDel(x)}>Delete</button></li>)}</ul>}</div></section>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add address" wide>
        <form onSubmit={saveAddress} noValidate className="grid gap-4 sm:grid-cols-2">
          <Input label="Label (e.g. Home)" value={a.label} onChange={sa('label')} className="sm:col-span-2" />
          <Input label="Full name" value={a.full_name} onChange={sa('full_name')} error={aErr.full_name} required />
          <Input label="Phone" value={a.phone} onChange={sa('phone')} error={aErr.phone} required />
          <Input label="Street address" className="sm:col-span-2" value={a.line1} onChange={sa('line1')} error={aErr.line1} required />
          <Input label="City" value={a.city} onChange={sa('city')} error={aErr.city} required />
          <Input label="Region" value={a.region} onChange={sa('region')} error={aErr.region} required />
          <Input label="Postal code" value={a.postal_code} onChange={sa('postal_code')} />
          <Select label="Country" value={a.country} onChange={sa('country')}>{cfg.countries.map((c) => <option key={c} value={c}>{COUNTRY_NAMES[c] ?? c}</option>)}</Select>
          <div className="flex justify-end gap-3 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button type="submit" loading={aBusy}>Save address</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete address?" text="This address will be removed from your account." confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={async () => { await api(`/api/account/addresses/${del!.id}`, { method: 'DELETE' }); setDel(null); addrs.reload() }} />
    </div>
  )
}

export function OrderHistory() {
  const res = useAsync((s) => api<Order[]>('/api/orders', { signal: s }), [])
  return (
    <div className="container-x py-10">
      <Seo title="Order history" noindex />
      <h1 className="text-3xl font-extrabold">Order history</h1>
      <div className="mt-8">
        {res.loading ? <PageLoader /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : (res.data ?? []).length === 0 ? <EmptyState title="No orders yet" text="When you place an order it will show up here." action={<LinkButton to="/shop">Shop bikes</LinkButton>} /> : (
          <ul className="space-y-4">{res.data!.map((o) => (
            <li key={o.number} className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div><Link to={`/account/orders/${o.number}`} className="font-bold hover:text-volt-700">{o.number}</Link><p className="text-sm text-charcoal-500">{formatDate(o.created_at)} · {o.items.reduce((n, i) => n + i.quantity, 0)} item(s)</p></div>
              <Badge tone={o.status === 'cancelled' ? 'red' : o.status === 'pending_payment' ? 'amber' : 'green'}>{STATUS_LABELS[o.status] ?? o.status}</Badge>
              <p className="font-extrabold">{formatMoney(o.total_minor, o.currency)}</p>
            </li>))}</ul>)}
      </div>
      {res.data && <p className="mt-6"><Alert kind="info">Need help with an order? Quote the order number when you contact us.</Alert></p>}
    </div>
  )
}
