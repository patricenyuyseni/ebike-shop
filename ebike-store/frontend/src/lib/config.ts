import { useEffect, useState } from 'react'
import { api } from './api'

export interface StoreConfig { currency: string; countries: string[]; payment_mode: string; payment_provider: string; tax_rate_percent: number; shipping: { standard: number; express: number; pickup: number }; max_upload_mb: number }
const FALLBACK: StoreConfig = { currency: 'USD', countries: ['CM'], payment_mode: 'test', payment_provider: 'test', tax_rate_percent: 0, shipping: { standard: 0, express: 0, pickup: 0 }, max_upload_mb: 5 }
let cached: StoreConfig | null = null

export function useStoreConfig(): StoreConfig {
  const [cfg, setCfg] = useState<StoreConfig>(cached ?? FALLBACK)
  useEffect(() => { if (!cached) api<StoreConfig>('/api/config').then((c) => { cached = c; setCfg(c) }).catch(() => {}) }, [])
  return cfg
}
export const COUNTRY_NAMES: Record<string, string> = { CM: 'Cameroon', NG: 'Nigeria', GA: 'Gabon', TD: 'Chad', CF: 'Central African Republic', CG: 'Congo', GQ: 'Equatorial Guinea', FR: 'France' }
