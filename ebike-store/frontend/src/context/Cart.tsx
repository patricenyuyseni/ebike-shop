import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { Cart } from '../lib/types'
import { useAuth } from './Auth'

interface CartCtx {
  cart: Cart | null
  loading: boolean
  count: number
  add: (productId: number, quantity?: number) => Promise<void>
  setQty: (productId: number, quantity: number) => Promise<void>
  remove: (productId: number) => Promise<void>
  refresh: () => Promise<void>
}
const Ctx = createContext<CartCtx>(null as unknown as CartCtx)
export const useCart = () => useContext(Ctx)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [cart, setCart] = useState<Cart | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try { setCart(await api<Cart>('/api/cart')) } catch { setCart(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (!authLoading) void refresh() }, [authLoading, user?.id, refresh])

  const add = useCallback(async (id: number, quantity = 1) => { setCart(await api<Cart>('/api/cart/items', { method: 'POST', body: { product_id: id, quantity } })) }, [])
  const setQty = useCallback(async (id: number, quantity: number) => { setCart(await api<Cart>(`/api/cart/items/${id}`, { method: 'PATCH', body: { quantity } })) }, [])
  const remove = useCallback(async (id: number) => { setCart(await api<Cart>(`/api/cart/items/${id}`, { method: 'DELETE' })) }, [])

  return <Ctx.Provider value={{ cart, loading, count: cart?.item_count ?? 0, add, setQty, remove, refresh }}>{children}</Ctx.Provider>
}
