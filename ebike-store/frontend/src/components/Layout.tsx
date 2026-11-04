import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { site } from '../config/site'
import { useAuth } from '../context/Auth'
import { useCart } from '../context/Cart'
import { api } from '../lib/api'
import type { Category } from '../lib/types'
import { Newsletter } from './Newsletter'

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-display text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-white'}`} aria-label={`${site.name} home`}>
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#12e068" /><path d="M36 8 20 34h11l-3 22 16-28H33z" fill="#0d0f11" /></svg>
      {site.name}
    </Link>
  )
}

const linkCls = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'text-volt-400' : 'text-charcoal-100 hover:text-white'}`

function CartIcon({ count }: { count: number }) {
  return (
    <Link to="/cart" className="relative rounded-lg p-2 text-white hover:bg-white/10" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}>
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6.2M9 20.5a.5.5 0 1 0 0 .01M17 20.5a.5.5 0 1 0 0 .01" /></svg>
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-volt-500 px-1 text-xs font-bold text-charcoal-950">{count}</span>}
    </Link>
  )
}

export function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const { count } = useCart()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [cats, setCats] = useState<Category[]>([])
  const [catOpen, setCatOpen] = useState(false)
  useEffect(() => { api<Category[]>('/api/categories').then(setCats).catch(() => setCats([])) }, [])
  useEffect(() => { setOpen(false); setCatOpen(false) }, [loc.pathname, loc.search])

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-charcoal-950/95 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          <NavLink to="/" end className={linkCls}>Home</NavLink>
          <NavLink to="/shop" end className={linkCls}>Shop Bikes</NavLink>
          <div className="relative" onMouseLeave={() => setCatOpen(false)}>
            <button className="rounded-lg px-3 py-2 text-sm font-medium text-charcoal-100 hover:text-white" aria-haspopup="true" aria-expanded={catOpen} onClick={() => setCatOpen((v) => !v)} onMouseEnter={() => setCatOpen(true)}>Categories ▾</button>
            {catOpen && (
              <div className="absolute left-0 top-full w-56 rounded-xl border border-white/10 bg-charcoal-900 p-2 shadow-2xl">
                {cats.length === 0 && <p className="px-3 py-2 text-sm text-charcoal-300">No categories yet</p>}
                {cats.map((c) => <Link key={c.id} to={`/shop?category=${c.slug}`} className="block rounded-lg px-3 py-2 text-sm text-charcoal-100 hover:bg-white/10 hover:text-volt-400">{c.name}</Link>)}
              </div>
            )}
          </div>
          <NavLink to="/about" className={linkCls}>About Us</NavLink>
          <NavLink to="/contact" className={linkCls}>Contact</NavLink>
        </nav>
        <div className="flex items-center gap-1">
          <div className="hidden items-center lg:flex">
            {user ? (
              <div className="flex items-center gap-1">
                <NavLink to="/account" className={linkCls}>Account</NavLink>
                {isAdmin && (
                  <NavLink to="/admin" className={linkCls}>
                    Admin Dashboard
                  </NavLink>
                )}
                <button onClick={async () => { await logout(); nav('/') }} className="rounded-lg px-3 py-2 text-sm text-charcoal-300 hover:text-white">Sign out</button>
              </div>
            ) : <NavLink to="/login" className={linkCls}>Account</NavLink>}
          </div>
          <CartIcon count={count} />
          <button className="rounded-lg p-2 text-white hover:bg-white/10 lg:hidden" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">{open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="border-t border-white/10 bg-charcoal-950 lg:hidden">
          <div className="container-x flex flex-col py-3">
            {[['/', 'Home'], ['/shop', 'Shop Bikes'], ['/about', 'About Us'], ['/contact', 'Contact'], [user ? '/account' : '/login', 'Account']].map(([to, label]) => (
              <Link key={label} to={to} className="rounded-lg px-3 py-3 text-base text-charcoal-100 hover:bg-white/5">{label}</Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className="rounded-lg px-3 py-3 text-base font-semibold text-volt-400 hover:bg-white/5"
              >
                Admin Dashboard
              </Link>
            )}
            <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-charcoal-400">Categories</p>
            <div className="grid grid-cols-2">{cats.map((c) => <Link key={c.id} to={`/shop?category=${c.slug}`} className="rounded-lg px-3 py-2 text-sm text-charcoal-200 hover:bg-white/5">{c.name}</Link>)}</div>
            {user && <button onClick={async () => { await logout(); nav('/') }} className="mt-2 rounded-lg px-3 py-3 text-left text-base text-charcoal-300">Sign out</button>}
          </div>
        </nav>
      )}
    </header>
  )
}

export function Footer() {
  return (
    <footer className="bg-charcoal-950 text-charcoal-300">
      <div className="container-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-sm">Premium electric bicycles for commuting, adventure and everything in between.</p>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Shop</h3>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-volt-400" to="/shop">All bikes</Link></li>
            <li><Link className="hover:text-volt-400" to="/shop?featured=true">Featured</Link></li>
            <li><Link className="hover:text-volt-400" to="/cart">Cart</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Company</h3>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-volt-400" to="/about">About us</Link></li>
            <li><Link className="hover:text-volt-400" to="/contact">Contact</Link></li>
            <li><Link className="hover:text-volt-400" to="/account">My account</Link></li>
            <li><Link className="hover:text-volt-400" to="/account/orders">Order history</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Get in touch</h3>
          <ul className="space-y-2 text-sm">
            {site.contactEmail && <li><a className="hover:text-volt-400" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></li>}
            {site.contactPhone && <li><a className="hover:text-volt-400" href={`tel:${site.contactPhone.replace(/\s/g, '')}`}>{site.contactPhone}</a></li>}
            {site.address && <li>{site.address}</li>}
            {!site.contactEmail && !site.contactPhone && !site.address && <li><Link className="hover:text-volt-400" to="/contact">Contact details</Link></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-charcoal-400">© {new Date().getFullYear()} {site.name}. All rights reserved.</div>
    </footer>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-volt-500 focus:px-4 focus:py-2 focus:text-charcoal-950">Skip to content</a>
      <Navbar />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  )
}

export { Newsletter }
