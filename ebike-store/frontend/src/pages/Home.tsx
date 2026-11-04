import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BikeIllustration } from '../components/BikeIllustration'
import { Faq } from '../components/Faq'
import { Newsletter } from '../components/Newsletter'
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard'
import { Seo } from '../components/Seo'
import { EmptyState, ErrorState, LinkButton, SectionHeading, Stars } from '../components/ui'
import { site } from '../config/site'
import { api, qs } from '../lib/api'
import type { Category, Paged, ProductCardData, Review } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const CAT_ICON: Record<string, string> = {
  mountain: '⛰️',
  commuter: '🏙️',
  folding: '📦',
  'fat-tire': '🏖️',
  road: '🛣️',
  cargo: '🧺',
}

const BENEFITS = [
  ['Beat the traffic', 'Glide past congestion and arrive without a sweat, on cycle lanes and shortcuts cars can’t use.'],
  ['Lower running costs', 'Charging a battery costs far less than fuel, and bikes need less upkeep than a car or motorbike.'],
  ['Ride further, climb easier', 'Motor assist flattens hills and headwinds so longer trips become realistic.'],
  ['Healthier, happier days', 'You still pedal, so you get gentle exercise and fresh air on every ride.'],
]

const WHY = [
  ['Specs you can compare', 'Motor, battery, range, weight and brakes are listed clearly for every bike.'],
  ['Live stock levels', 'What you see is what is available. No surprise cancellations after you pay.'],
  ['Secure checkout', 'Payments are handled by a trusted provider. We never see or store card details.'],
  ['Real people to help', 'Questions before or after your purchase? Our team is a message away.'],
]

function shuffleProducts<T>(products: T[]): T[] {
  const shuffled = [...products]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

export default function Home() {
  const featured = useAsync(
    (s) => api<Paged<ProductCardData>>(`/api/products${qs({ featured: true, page_size: 48 })}`, { signal: s }),
    [],
  )

  const latest = useAsync(
    (s) => api<Paged<ProductCardData>>(`/api/products${qs({ page_size: 48 })}`, { signal: s }),
    [],
  )

  const cats = useAsync((s) => api<Category[]>('/api/categories', { signal: s }), [])
  const reviews = useAsync((s) => api<Review[]>('/api/reviews/featured', { signal: s }), [])

  const products = featured.data?.items.length
    ? featured.data.items
    : latest.data?.items ?? []

  const list = useMemo(() => shuffleProducts(products).slice(0, 6), [products])
  const busy = featured.loading || latest.loading

  return (
    <>
      <Seo
        title={`${site.name} | Electric Bicycles`}
        description="Shop premium electric bicycles: mountain, commuter, folding, fat-tire, road and cargo e-bikes. Clear specs, live stock and secure checkout."
      />

      {/* HERO SECTION */}
      <section className="relative isolate overflow-hidden bg-charcoal-950 text-white">
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-volt-500/20 blur-3xl animate-pulse-glow"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute -bottom-40 -left-32 h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="container-x relative grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-14 lg:py-24">
          <div className="reveal relative z-10">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-volt-500/40 bg-volt-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-volt-400">
              ⚡ Premium electric bikes
            </p>

            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight !text-white sm:text-5xl lg:text-6xl">
              Ride Further.
              <br />
              Live Freer.
              <br />
              <span className="text-volt-400">Go Electric.</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg text-charcoal-200">
              Discover powerful electric bikes built for commuting, adventure and everything in between.
              Find your ride and experience a new level of freedom.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/shop" className="!px-7 !py-3.5 text-base">
                Shop Bikes
              </LinkButton>

              <LinkButton to="/shop#categories" variant="ghostLight" className="!px-7 !py-3.5 text-base">
                Explore Collection
              </LinkButton>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-charcoal-300">
              <span>✓ Quality electric bikes</span>
              <span>✓ Clear product specifications</span>
              <span>✓ Secure checkout</span>
            </div>
          </div>

          {/* E-BIKE IMAGE WITH DARK BACKGROUND */}
          <div className="reveal relative [animation-delay:.15s]">
            <div className="absolute -inset-3 rounded-[2rem] bg-volt-500/10 blur-2xl" aria-hidden="true" />

            <div className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-charcoal-950 via-charcoal-900 to-emerald-950 p-4 shadow-glow sm:p-6">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_65%_45%,rgba(163,230,53,0.22),transparent_60%)]"
                aria-hidden="true"
              />

              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent"
                aria-hidden="true"
              />

              {site.heroImage ? (
                <img
                  src={site.heroImage}
                  alt="Sur-Ron electric dirt bike"
                  className="relative z-10 mx-auto max-h-[460px] w-full object-contain drop-shadow-2xl"
                  fetchPriority="high"
                />
              ) : (
                <div className="relative z-10 rounded-2xl border border-white/10 bg-charcoal-900/50 p-6 text-white">
                  <BikeIllustration className="w-full" animate />
                </div>
              )}

              <div className="relative z-10 mt-3 border-t border-white/10 pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-volt-400">
                  Built for adventure
                </p>
                <p className="mt-1 text-lg font-bold text-white">
                  Find your next electric ride.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED BIKES */}
      <section className="container-x py-16 lg:py-20" aria-labelledby="featured-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="Featured" title="Featured electric bicycles" />
          <Link to="/shop" className="text-sm font-semibold text-volt-700 hover:underline">
            View all bikes →
          </Link>
        </div>

        <span id="featured-h" className="sr-only">Featured electric bicycles</span>

        <div className="mt-8">
          {busy ? (
            <ProductGridSkeleton />
          ) : featured.error && latest.error ? (
            <ErrorState
              message={featured.error.message}
              onRetry={() => {
                featured.reload()
                latest.reload()
              }}
            />
          ) : list.length === 0 ? (
            <EmptyState
              title="Our bikes are on their way"
              text="New electric bicycles will appear here very soon. Check back shortly."
              action={<LinkButton to="/shop" variant="dark">Browse the shop</LinkButton>}
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="bg-charcoal-50 py-16 lg:py-20" aria-labelledby="cats-h" id="categories">
        <div className="container-x">
          <SectionHeading eyebrow="Categories" title="Find the bike that fits your life" center />
          <span id="cats-h" className="sr-only">Bike categories</span>

          {cats.loading ? (
            <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-charcoal-100" />
              ))}
            </div>
          ) : cats.error ? (
            <div className="mt-8">
              <ErrorState message={cats.error.message} onRetry={cats.reload} />
            </div>
          ) : (cats.data ?? []).length === 0 ? (
            <div className="mt-8">
              <EmptyState title="Categories coming soon" />
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-3">
              {cats.data!.map((c) => (
                <Link
                  key={c.id}
                  to={`/shop?category=${c.slug}`}
                  className="group card flex flex-col justify-between p-6 transition hover:-translate-y-1 hover:border-volt-500 hover:shadow-glow"
                >
                  <span className="text-3xl" aria-hidden="true">{CAT_ICON[c.slug] ?? '🚲'}</span>
                  <div className="mt-6">
                    <h3 className="text-lg font-bold">{c.name}</h3>
                    <p className="text-sm text-charcoal-500">
                      {c.product_count} bike{c.product_count === 1 ? '' : 's'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* BENEFITS */}
      <section className="container-x py-16 lg:py-20" aria-labelledby="benefits-h">
        <SectionHeading eyebrow="Why electric" title="The benefits of going electric" center />
        <span id="benefits-h" className="sr-only">Benefits of electric bicycles</span>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(([t, d], i) => (
            <div key={t} className="card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-volt-100 font-bold text-volt-800">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-bold">{t}</h3>
              <p className="mt-2 text-sm text-charcoal-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section className="bg-charcoal-950 py-16 text-white lg:py-20" aria-labelledby="why-h">
        <div className="container-x">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-volt-400">
              Why choose us
            </p>
            <h2 id="why-h" className="text-3xl font-extrabold !text-white sm:text-4xl">
              Built around trust and clarity
            </h2>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-charcoal-900 p-6">
                <span className="text-volt-400" aria-hidden="true">✔</span>
                <h3 className="mt-3 text-lg font-bold !text-white">{t}</h3>
                <p className="mt-2 text-sm text-charcoal-300">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CUSTOMER REVIEWS */}
      {(reviews.data?.length ?? 0) > 0 && (
        <section className="container-x py-16 lg:py-20" aria-labelledby="rev-h">
          <SectionHeading eyebrow="Reviews" title="What our customers say" center />
          <span id="rev-h" className="sr-only">Customer reviews</span>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {reviews.data!.slice(0, 3).map((r, i) => (
              <figure key={i} className="card p-6">
                <Stars value={r.rating} />
                {r.title && <p className="mt-3 font-semibold">{r.title}</p>}
                <blockquote className="mt-2 text-sm text-charcoal-600">{r.body}</blockquote>
                <figcaption className="mt-4 text-sm text-charcoal-500">
                  {r.author} ·{' '}
                  <Link className="text-volt-700 hover:underline" to={`/product/${r.product_slug}`}>
                    {r.product_name}
                  </Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="container-x py-16 lg:py-20" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl">
          <SectionHeading eyebrow="FAQ" title="Frequently asked questions" center />
          <span id="faq-h" className="sr-only">Frequently asked questions</span>
          <div className="mt-10">
            <Faq />
          </div>
        </div>
      </section>

      <Newsletter />
    </>
  )
}