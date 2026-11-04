import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Layout'
import { Seo } from '../../components/Seo'
import { useAuth } from '../../context/Auth'

const NAV = [['/admin', 'Dashboard', true], ['/admin/products', 'Products', false], ['/admin/categories', 'Categories', false], ['/admin/inventory', 'Inventory', false], ['/admin/orders', 'Orders', false], ['/admin/discounts', 'Discounts', false], ['/admin/reviews', 'Reviews', false], ['/admin/audit', 'Audit log', false]] as const

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const links = (
    <ul className="space-y-1">{NAV.map(([to, label, end]) => (
      <li key={to}><NavLink to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-volt-500 text-charcoal-950' : 'text-charcoal-200 hover:bg-white/10'}`}>{label}</NavLink></li>
    ))}</ul>
  )
  return (
    <div className="min-h-screen bg-charcoal-50 lg:flex">
      <Seo title="Admin" noindex />
      <aside className="hidden w-60 shrink-0 flex-col bg-charcoal-950 p-4 lg:flex" aria-label="Admin navigation">
        <Logo /><p className="mb-6 mt-1 text-xs uppercase tracking-widest text-charcoal-400">Admin</p>
        {links}
        <div className="mt-auto border-t border-white/10 pt-4 text-xs text-charcoal-300"><p className="truncate">{user?.email}</p><Link to="/" className="mt-2 block hover:text-white">← View store</Link><button className="mt-1 hover:text-white" onClick={async () => { await logout(); nav('/admin/login') }}>Sign out</button></div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between bg-charcoal-950 px-4 py-3 lg:hidden"><Logo /><button className="rounded-lg p-2 text-white" aria-expanded={open} aria-label="Toggle admin menu" onClick={() => setOpen((v) => !v)}>☰</button></div>
        {open && <nav aria-label="Admin mobile" className="bg-charcoal-950 px-4 pb-4 lg:hidden">{links}<button className="mt-3 text-sm text-charcoal-300" onClick={async () => { await logout(); nav('/admin/login') }}>Sign out</button></nav>}
        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold">{title}</h1>{sub && <p className="text-sm text-charcoal-500">{sub}</p>}</div><div className="flex flex-wrap gap-2">{actions}</div></div>
}
