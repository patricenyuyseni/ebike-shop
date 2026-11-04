import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductCardData } from '../lib/types'

const state = vi.hoisted(() => ({ user: null as unknown, isAdmin: false, cart: null as unknown, add: vi.fn(), login: vi.fn(), post: vi.fn() }))

vi.mock('../context/Auth', () => ({ useAuth: () => ({ user: state.user, loading: false, isAdmin: state.isAdmin, login: state.login, register: vi.fn(), adminLogin: vi.fn(), logout: vi.fn() }) }))
vi.mock('../context/Cart', () => ({ useCart: () => ({ cart: state.cart, loading: false, count: 0, add: state.add, setQty: vi.fn(), remove: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../context/Toast', () => ({ useToast: () => vi.fn() }))
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api: (...a: unknown[]) => state.post(...a) }))

import { ProductCard } from '../components/ProductCard'
import { RequireAdmin } from '../components/Guards'
import { Login } from '../pages/Auth'
import Checkout from '../pages/Checkout'
import CartPage from '../pages/Cart'

const bike: ProductCardData = { id: 1, slug: 'volt', name: 'Volt X', price_minor: 900000, original_price_minor: 1000000, currency: 'USD', category: { name: 'Mountain', slug: 'mountain' }, image_url: null, stock_status: 'in_stock', available_quantity: 5, is_featured: true, range_km: 90, motor_power_w: 750 }
const wrap = (ui: React.ReactNode, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)
beforeEach(() => { state.user = null; state.isAdmin = false; state.cart = null; vi.clearAllMocks(); state.post.mockResolvedValue({}) })

describe('ProductCard', () => {
  it('shows name, price, discount and specs', () => {
    wrap(<ProductCard p={bike} />)
    expect(screen.getByRole('heading', { name: 'Volt X' })).toBeInTheDocument()
    expect(screen.getByText('-10%')).toBeInTheDocument()
    expect(screen.getByText(/90 km range/)).toBeInTheDocument()
  })
  it('disables purchase when sold out', () => {
    wrap(<ProductCard p={{ ...bike, stock_status: 'out_of_stock', available_quantity: 0 }} />)
    expect(screen.getByRole('button', { name: /add volt x to cart/i })).toBeDisabled()
    expect(screen.getAllByText('Sold out').length).toBeGreaterThan(0)
  })
  it('adds to cart on click', async () => {
    state.add.mockResolvedValue(undefined)
    wrap(<ProductCard p={bike} />)
    await userEvent.click(screen.getByRole('button', { name: /add volt x to cart/i }))
    expect(state.add).toHaveBeenCalledWith(1, 1)
  })
})

describe('Route guards', () => {
  const tree = <Routes><Route path="/admin/login" element={<p>admin login page</p>} /><Route path="/admin" element={<RequireAdmin />}><Route index element={<p>secret dashboard</p>} /></Route></Routes>
  it('sends anonymous visitors to admin login', () => { wrap(tree, '/admin'); expect(screen.getByText('admin login page')).toBeInTheDocument() })
  it('sends signed-in customers away from admin', () => { state.user = { id: 1, permissions: [] }; wrap(tree, '/admin'); expect(screen.queryByText('secret dashboard')).not.toBeInTheDocument() })
  it('lets administrators in', () => { state.user = { id: 1, permissions: ['dashboard:read'] }; state.isAdmin = true; wrap(tree, '/admin'); expect(screen.getByText('secret dashboard')).toBeInTheDocument() })
})

describe('Login form', () => {
  it('validates before sending anything', async () => {
    wrap(<Login />)
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(state.login).not.toHaveBeenCalled()
  })
  it('shows the server error message', async () => {
    const { ApiError } = await import('../lib/api')
    state.login.mockRejectedValue(new ApiError(401, 'Incorrect email or password.'))
    wrap(<Login />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument()
  })
})

const cart = { items: [{ product_id: 1, slug: 'volt', name: 'Volt X', image_url: null, unit_price_minor: 900000, quantity: 2, line_total_minor: 1800000, available: 5, issue: null }], subtotal_minor: 1800000, item_count: 2, currency: 'USD', checkout_ready: true }

describe('Cart page', () => {
  it('shows the empty state', () => { state.cart = { items: [], subtotal_minor: 0, item_count: 0, currency: 'USD', checkout_ready: false }; wrap(<CartPage />); expect(screen.getByText('Your cart is empty')).toBeInTheDocument() })
  it('shows items, quantities and the subtotal from the server', () => { state.cart = cart; wrap(<CartPage />); expect(screen.getByText('Volt X')).toBeInTheDocument(); expect(screen.getAllByText(/1,800,000/).length).toBeGreaterThan(0) })
  it('warns about stock problems and blocks checkout', () => { state.cart = { ...cart, checkout_ready: false, items: [{ ...cart.items[0], issue: 'Only 1 left in stock.' }] }; wrap(<CartPage />); expect(screen.getByText('Only 1 left in stock.')).toBeInTheDocument(); expect(screen.getByRole('link', { name: /proceed to checkout/i })).toHaveAttribute('aria-disabled', 'true') })
})

describe('Checkout form', () => {
  it('blocks submission and shows errors when fields are missing', async () => {
    state.cart = cart
    state.post.mockImplementation(async (path: string) => (path.includes('quote') ? { subtotal_minor: 1800000, discount_minor: 0, shipping_minor: 5000, tax_minor: 0, total_minor: 1805000, currency: 'USD', discount_code: null, checkout_ready: true, items: [] } : { countries: ['CM'], shipping: { standard: 5000, express: 15000, pickup: 0 }, payment_mode: 'test' }))
    wrap(<Checkout />)
    await userEvent.click(screen.getByRole('button', { name: /place order/i }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your street address.')).toBeInTheDocument()
    await waitFor(() => expect(state.post.mock.calls.some(([p]) => p === '/api/checkout')).toBe(false))
  })
  it('shows the server-calculated total and the test-mode notice', async () => {
    state.cart = cart
    state.post.mockImplementation(async (path: string) => (path.includes('quote') ? { subtotal_minor: 1800000, discount_minor: 0, shipping_minor: 5000, tax_minor: 0, total_minor: 1805000, currency: 'USD', discount_code: null, checkout_ready: true, items: [] } : { currency: 'USD', countries: ['CM'], shipping: { standard: 5000, express: 15000, pickup: 0 }, payment_mode: 'test', payment_provider: 'test', tax_rate_percent: 0, max_upload_mb: 5 }))
    wrap(<Checkout />)
    expect(await screen.findByText(/1,805,000/)).toBeInTheDocument()
  })
})
