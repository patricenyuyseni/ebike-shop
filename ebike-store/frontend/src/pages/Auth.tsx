import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Alert, Button, Input } from '../components/ui'
import { useAuth } from '../context/Auth'
import { ApiError } from '../lib/api'
import { isEmail, validatePassword, isPhone, type Errors } from '../lib/validate'

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return <div className="container-x flex min-h-[70vh] items-center justify-center py-12"><div className="card w-full max-w-md p-8"><h1 className="text-2xl font-extrabold">{title}</h1><p className="mt-1 text-sm text-charcoal-500">{sub}</p><div className="mt-6">{children}</div></div></div>
}
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/account')

export function Login() {
  const { user, login } = useAuth()
  const nav = useNavigate()
  const next = safeNext(useSearchParams()[0].get('next'))
  const [f, setF] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={next} replace />
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    const v: Errors = {}
    if (!isEmail(f.email)) v.email = 'Enter a valid email address.'
    if (!f.password) v.password = 'Enter your password.'
    setErrors(v); if (Object.keys(v).length) return
    setBusy(true)
    try { await login(f.email, f.password); nav(next, { replace: true }) }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <Shell title="Welcome back" sub="Sign in to view your orders and check out faster.">
      <Seo title="Sign in" noindex />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input label="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} />
        <Input label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={errors.password} />
        {err && <Alert>{err}</Alert>}
        <Button type="submit" loading={busy} className="w-full">Sign in</Button>
      </form>
      <p className="mt-5 text-center text-sm text-charcoal-500">New here? <Link className="font-semibold text-volt-700 hover:underline" to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </Shell>
  )
}

export function Register() {
  const { user, register } = useAuth()
  const nav = useNavigate()
  const next = safeNext(useSearchParams()[0].get('next'))
  const [f, setF] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={next} replace />
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    const v: Errors = {}
    if (f.full_name.trim().length < 2) v.full_name = 'Enter your full name.'
    if (!isEmail(f.email)) v.email = 'Enter a valid email address.'
    if (f.phone && !isPhone(f.phone)) v.phone = 'Enter a valid phone number.'
    const pw = validatePassword(f.password); if (pw) v.password = pw
    setErrors(v); if (Object.keys(v).length) return
    setBusy(true)
    try { await register({ ...f, phone: f.phone || undefined }); nav(next, { replace: true }) }
    catch (x) { if (x instanceof ApiError) { setErrors(x.fieldErrors); setErr(x.message) } else setErr('Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <Shell title="Create your account" sub="Track orders and check out faster.">
      <Seo title="Create account" noindex />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input label="Full name" autoComplete="name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} error={errors.full_name} required />
        <Input label="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} required />
        <Input label="Phone (optional)" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={errors.phone} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 10 characters with letters and numbers." value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={errors.password} required />
        {err && <Alert>{err}</Alert>}
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
      <p className="mt-5 text-center text-sm text-charcoal-500">Already registered? <Link className="font-semibold text-volt-700 hover:underline" to="/login">Sign in</Link></p>
    </Shell>
  )
}
