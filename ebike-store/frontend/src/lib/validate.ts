export type Errors = Record<string, string>
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE = /^\+?[0-9 ()-]{7,20}$/

export const isEmail = (v: string) => EMAIL.test(v.trim())
export const isPhone = (v: string) => PHONE.test(v.trim())

export function validatePassword(v: string): string | null {
  if (v.length < 10) return 'Use at least 10 characters.'
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'Include both letters and numbers.'
  return null
}

export function validateAddress(f: Record<string, string>, requireEmail: boolean): Errors {
  const e: Errors = {}
  if (requireEmail && !isEmail(f.email ?? '')) e.email = 'Enter a valid email address.'
  if ((f.full_name ?? '').trim().length < 2) e.full_name = 'Enter your full name.'
  if (!isPhone(f.phone ?? '')) e.phone = 'Enter a valid phone number, e.g. +237 6XX XXX XXX.'
  if ((f.line1 ?? '').trim().length < 3) e.line1 = 'Enter your street address.'
  if ((f.city ?? '').trim().length < 2) e.city = 'Enter your city.'
  if ((f.region ?? '').trim().length < 2) e.region = 'Enter your region.'
  if (!/^[A-Za-z]{2}$/.test(f.country ?? '')) e.country = 'Choose a country.'
  return e
}
