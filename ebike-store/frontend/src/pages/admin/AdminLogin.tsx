import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Layout'
import { Seo } from '../../components/Seo'
import { Alert, Button, Input } from '../../components/ui'
import { useAuth } from '../../context/Auth'
import { ApiError } from '../../lib/api'

export default function AdminLogin() {
  const { user, isAdmin, adminLogin } = useAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user && isAdmin) return <Navigate to="/admin" replace />
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!f.email || !f.password) { setErr('Enter your email and password.'); return }
    setBusy(true)
    try { await adminLogin(f.email, f.password); nav('/admin', { replace: true }) }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-950 px-4">
      <Seo title="Admin sign in" noindex />
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex justify-center rounded-xl bg-charcoal-950 py-3"><Logo /></div>
        <h1 className="text-xl font-extrabold">Administrator sign in</h1>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <Input label="Email" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <Alert>{err}</Alert>}
          <Button type="submit" loading={busy} className="w-full">Sign in</Button>
        </form>
      </div>
    </div>
  )
}
