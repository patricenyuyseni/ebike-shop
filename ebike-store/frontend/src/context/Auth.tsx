import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, resetCsrf } from '../lib/api'
import type { Me } from '../lib/types'

interface AuthCtx {
  user: Me | null
  loading: boolean
  login: (email: string, password: string) => Promise<Me>
  adminLogin: (email: string, password: string) => Promise<Me>
  register: (data: { email: string; password: string; full_name: string; phone?: string }) => Promise<Me>
  logout: () => Promise<void>
  isAdmin: boolean
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<Me | null>('/api/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const me = await api<Me>('/api/auth/login', { method: 'POST', body: { email, password } }); setUser(me); return me
  }, [])
  const adminLogin = useCallback(async (email: string, password: string) => {
    const me = await api<Me>('/api/admin/auth/login', { method: 'POST', body: { email, password } }); setUser(me); return me
  }, [])
  const register = useCallback(async (data: { email: string; password: string; full_name: string; phone?: string }) => {
    const me = await api<Me>('/api/auth/register', { method: 'POST', body: data }); setUser(me); return me
  }, [])
  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    resetCsrf(); setUser(null)
  }, [])

  return <Ctx.Provider value={{ user, loading, login, adminLogin, register, logout, isAdmin: !!user?.permissions.includes('dashboard:read') }}>{children}</Ctx.Provider>
}
