import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Alert, Button, EmptyState, Input, LinkButton, PageLoader } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useCart } from '../context/Cart'
import { api, ApiError } from '../lib/api'
import { formatMoney } from '../lib/format'
import type { Quote } from '../lib/types'
import { validateAddress, type Errors } from '../lib/validate'

interface CheckoutResult {
  order: { number: string; access_token: string }
  payment: { checkout_url: string; mode: string } | null
}

const METHODS = [
  ['standard', 'Standard delivery', 'Delivered to your address'],
  ['express', 'Express delivery', 'Priority handling'],
  ['pickup', 'Store pickup', 'Collect it yourself'],
] as const

export default function Checkout() {
  const { user } = useAuth()
  const { cart, loading, refresh } = useCart()
  const nav = useNavigate()

  const [f, setF] = useState({
    email: '',
    full_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    region: '',
    country: '',
    postal_code: '',
  })

  const [method, setMethod] = useState<'standard' | 'express' | 'pickup'>('standard')
  const [code, setCode] = useState('')
  const [applied, setApplied] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [busy, setBusy] = useState(false)
  const idemKey = useRef(crypto.randomUUID())

  useEffect(() => {
    if (user) {
      setF((x) => ({
        ...x,
        email: x.email || user.email,
        full_name: x.full_name || user.full_name || '',
        phone: x.phone || user.phone || '',
      }))
    }
  }, [user])

  useEffect(() => {
    if (!cart || cart.items.length === 0) return

    let active = true

    api<Quote>('/api/checkout/quote', {
      method: 'POST',
      body: { shipping_method: method, discount_code: applied || null },
    })
      .then((q) => {
        if (active) {
          setQuote(q)
          setCodeError('')
        }
      })
      .catch((e) => {
        if (active && applied) {
          setApplied('')
          setCodeError(e instanceof ApiError ? e.message : 'Invalid code')
        }
      })

    return () => {
      active = false
    }
  }, [cart, method, applied])

  const set = (k: string) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')

    const errs = validateAddress(f, true)
    setErrors(errs)

    if (Object.keys(errs).length) {
      document
        .getElementById('checkout-form')
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus()
      return
    }

    setBusy(true)

    try {
      const r = await api<CheckoutResult>('/api/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': idemKey.current },
        body: {
          ...f,
          country: f.country.trim(),
          line2: f.line2 || null,
          postal_code: f.postal_code || null,
          shipping_method: method,
          discount_code: applied || null,
        },
      })

      await refresh()

      const url = r.payment?.checkout_url

      if (!url) {
        nav(`/order/${r.order.number}?token=${r.order.access_token}`)
        return
      }

      const u = new URL(url, window.location.origin)

      if (u.origin === window.location.origin) {
        nav(u.pathname + u.search)
      } else {
        window.location.assign(url)
      }
    } catch (x) {
      if (x instanceof ApiError) {
        setErrors(x.fieldErrors)
        setFormError(x.message)
        if (x.status === 409) void refresh()
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageLoader />

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-x py-12">
        <Seo title="Checkout" noindex />
        <EmptyState
          title="Your cart is empty"
          text="Add a bike before checking out."
          action={<LinkButton to="/shop">Shop bikes</LinkButton>}
        />
      </div>
    )
  }

  const cur = cart.currency

  return (
    <div className="container-x py-10">
      <Seo title="Checkout" noindex />
      <h1 className="text-3xl font-extrabold">Checkout</h1>

      {!user && (
        <p className="mt-3 text-sm text-charcoal-500">
          Have an account?{' '}
          <Link className="font-semibold text-volt-700 hover:underline" to="/login?next=/checkout">
            Sign in
          </Link>{' '}
          to save your details, or continue as a guest.
        </p>
      )}

      <form
        id="checkout-form"
        onSubmit={submit}
        noValidate
        className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]"
      >
        <div className="space-y-8">
          <section className="card p-6" aria-labelledby="c1">
            <h2 id="c1" className="text-lg font-bold">Contact &amp; shipping address</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                className="sm:col-span-2"
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={f.email}
                onChange={set('email')}
                error={errors.email}
              />

              <Input
                label="Full name"
                autoComplete="name"
                required
                value={f.full_name}
                onChange={set('full_name')}
                error={errors.full_name}
              />

              <Input
                label="Phone"
                type="tel"
                autoComplete="tel"
                required
                hint="Used for delivery and payment confirmation"
                value={f.phone}
                onChange={set('phone')}
                error={errors.phone}
              />

              <Input
                className="sm:col-span-2"
                label="Street address"
                autoComplete="address-line1"
                required
                value={f.line1}
                onChange={set('line1')}
                error={errors.line1}
              />

              <Input
                className="sm:col-span-2"
                label="Apartment, landmark (optional)"
                autoComplete="address-line2"
                value={f.line2}
                onChange={set('line2')}
              />

              <Input
                label="City"
                autoComplete="address-level2"
                required
                value={f.city}
                onChange={set('city')}
                error={errors.city}
              />

              <Input
                label="Region"
                autoComplete="address-level1"
                required
                value={f.region}
                onChange={set('region')}
                error={errors.region}
              />

              <Input
                className="sm:col-span-2"
                label="Country"
                autoComplete="country-name"
                required
                placeholder="Enter your country"
                value={f.country}
                onChange={set('country')}
                error={errors.country}
              />

              <Input
                label="Postal code (if applicable)"
                autoComplete="postal-code"
                value={f.postal_code}
                onChange={set('postal_code')}
                error={errors.postal_code}
              />
            </div>
          </section>

          <section className="card p-6" aria-labelledby="c2">
            <h2 id="c2" className="text-lg font-bold">Shipping method</h2>

            <div className="mt-4 space-y-3">
              {METHODS.map(([id, name, desc]) => (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 ${
                    method === id
                      ? 'border-volt-500 bg-volt-50'
                      : 'border-charcoal-100'
                  }`}
                >
                  <input
                    type="radio"
                    name="ship"
                    checked={method === id}
                    onChange={() => setMethod(id)}
                  />
                  <span>
                    <span className="block font-semibold">{name}</span>
                    <span className="text-sm text-charcoal-500">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="card h-fit p-6 lg:sticky lg:top-24" aria-label="Order summary">
          <h2 className="text-lg font-bold">Order summary</h2>

          <ul className="mt-4 divide-y divide-charcoal-100 text-sm">
            {cart.items.map((i) => (
              <li key={i.product_id} className="flex justify-between gap-3 py-2">
                <span>
                  {i.name} × {i.quantity}
                  {i.issue && <span className="block text-red-600">{i.issue}</span>}
                </span>
                <span className="font-semibold">{formatMoney(i.line_total_minor, cur)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex gap-2">
            <input
              aria-label="Discount code"
              className="field"
              placeholder="Discount code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={40}
            />
            <Button type="button" variant="outline" onClick={() => setApplied(code.trim())}>
              Apply
            </Button>
          </div>

          {codeError && (
            <p role="alert" className="mt-1 text-xs font-medium text-red-600">{codeError}</p>
          )}

          {quote && (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-charcoal-500">Subtotal</dt>
                <dd>{formatMoney(quote.subtotal_minor, cur)}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-charcoal-500">
                  Shipping ({method === 'standard' ? 'Standard' : method === 'express' ? 'Express' : 'Pickup'})
                </dt>
                <dd>{formatMoney(quote.shipping_minor, quote.currency || cur)}</dd>
              </div>

              {quote.discount_minor > 0 && (
                <div className="flex justify-between text-volt-800">
                  <dt>Discount ({quote.discount_code})</dt>
                  <dd>−{formatMoney(quote.discount_minor, cur)}</dd>
                </div>
              )}

              {quote.tax_minor > 0 && (
                <div className="flex justify-between">
                  <dt className="text-charcoal-500">Tax</dt>
                  <dd>{formatMoney(quote.tax_minor, cur)}</dd>
                </div>
              )}

              <div className="flex justify-between border-t border-charcoal-100 pt-3 text-lg font-extrabold">
                <dt>Total</dt>
                <dd>{formatMoney(quote.total_minor, cur)}</dd>
              </div>
            </dl>
          )}

          <p className="mt-2 text-xs text-charcoal-400">
            Delivery charges, if applicable, will be confirmed before your order is finalized.
          </p>

          {formError && (
            <div className="mt-4">
              <Alert>{formError}</Alert>
            </div>
          )}

          <Button
            type="submit"
            loading={busy}
            disabled={!cart.checkout_ready}
            className="mt-5 w-full !py-3 text-base"
          >
            Place order &amp; pay
          </Button>

          <p className="mt-3 text-center text-xs text-charcoal-400">
            You will be taken to the secure payment step. We never see your card or PIN.
          </p>
        </aside>
      </form>
    </div>
  )
}