import { describe, expect, it } from 'vitest'
import { discountPercent, formatMoney, optimizeImage } from './format'
import { isEmail, isPhone, validateAddress, validatePassword } from './validate'

describe('format', () => {
  it('formats USD without decimals', () => { expect(formatMoney(1450000, 'USD')).toMatch(/1,450,000/) })
  it('computes discount percent only for real discounts', () => {
    expect(discountPercent(900, 1000)).toBe(10)
    expect(discountPercent(1000, 1000)).toBeNull()
    expect(discountPercent(1000, null)).toBeNull()
  })
  it('adds Cloudinary optimisation only to Cloudinary URLs', () => {
    expect(optimizeImage('https://res.cloudinary.com/x/image/upload/v1/a.jpg', 400)).toContain('/image/upload/f_auto,q_auto,c_limit,w_400/v1/a.jpg')
    expect(optimizeImage('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
    expect(optimizeImage(null)).toBeNull()
  })
})

describe('validation', () => {
  it('validates emails and phones', () => {
    expect(isEmail('a@b.co')).toBe(true); expect(isEmail('nope')).toBe(false)
    expect(isPhone('+237 677 000 000')).toBe(true); expect(isPhone('abc')).toBe(false)
  })
  it('enforces password rules', () => {
    expect(validatePassword('short1')).toBeTruthy(); expect(validatePassword('onlyletterslong')).toBeTruthy(); expect(validatePassword('Passw0rd-long1')).toBeNull()
  })
  it('reports every missing address field', () => {
    const e = validateAddress({}, true)
    expect(Object.keys(e).sort()).toEqual(['city', 'country', 'email', 'full_name', 'line1', 'phone', 'region'])
  })
})
