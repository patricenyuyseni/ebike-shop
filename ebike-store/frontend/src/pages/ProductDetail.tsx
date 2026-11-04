import { Link, useParams } from 'react-router-dom'
import { ProductCard } from '../components/ProductCard'
import { ProductView } from '../components/ProductView'
import { Seo } from '../components/Seo'
import { ErrorState, LinkButton, PageLoader, Stars } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { formatDate } from '../lib/format'
import type { ProductDetailData } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { ReviewForm } from '../components/ReviewForm'

interface Reviews { count: number; average: number | null; items: { id: number; rating: number; title: string | null; body: string; author: string; created_at: string }[] }

export default function ProductDetail() {
  const { slug = '' } = useParams()
  const res = useAsync((s) => api<ProductDetailData>(`/api/products/${encodeURIComponent(slug)}`, { signal: s }), [slug])
  const rev = useAsync((s) => api<Reviews>(`/api/products/${encodeURIComponent(slug)}/reviews`, { signal: s }).catch(() => ({ count: 0, average: null, items: [] } as Reviews)), [slug])

  if (res.loading) return <PageLoader label="Loading bike…" />
  if (res.error?.status === 404 || (res.error && res.error instanceof ApiError && res.error.status === 404)) return (
    <div className="container-x py-20 text-center"><Seo title="Bike not found" noindex /><h1 className="text-3xl font-extrabold">We couldn&apos;t find that bike</h1><p className="mt-2 text-charcoal-500">It may have been removed or is no longer available.</p><LinkButton to="/shop" className="mt-6">Back to the shop</LinkButton></div>
  )
  if (res.error || !res.data) return <div className="container-x py-12"><ErrorState message={res.error?.message ?? 'Error'} onRetry={res.reload} /></div>
  const p = res.data
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku, description: p.description.slice(0, 500),
    image: p.images.map((i) => i.url), category: p.category?.name,
    offers: { '@type': 'Offer', priceCurrency: p.currency, price: p.price_minor, availability: p.stock_status === 'out_of_stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' },
    ...(rev.data?.count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rev.data.average, reviewCount: rev.data.count } } : {}),
  }
  return (
    <div className="container-x py-8 lg:py-12">
      <Seo title={p.name} description={(p.description || `${p.name} electric bicycle`).replace(/\s+/g, ' ').slice(0, 155)} image={p.image_url} jsonLd={ld} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-charcoal-500"><Link to="/" className="hover:underline">Home</Link> / <Link to="/shop" className="hover:underline">Shop</Link>{p.category && <> / <Link to={`/shop?category=${p.category.slug}`} className="hover:underline">{p.category.name}</Link></>} / <span className="text-charcoal-900">{p.name}</span></nav>
      <ProductView p={p} />

      <section className="mt-14" aria-labelledby="rev-h">
        <h2 id="rev-h" className="text-2xl font-extrabold">Customer reviews</h2>
        {rev.data && rev.data.count > 0 ? (
          <div className="mt-4">
            <p className="flex items-center gap-2 text-sm"><Stars value={rev.data.average ?? 0} /> <span className="font-semibold">{rev.data.average}</span> from {rev.data.count} review{rev.data.count === 1 ? '' : 's'}</p>
            <ul className="mt-5 grid gap-4 md:grid-cols-2">{rev.data.items.map((r) => <li key={r.id} className="card p-5"><Stars value={r.rating} />{r.title && <p className="mt-2 font-semibold">{r.title}</p>}<p className="mt-1 text-sm text-charcoal-600">{r.body}</p><p className="mt-3 text-xs text-charcoal-400">{r.author} · {formatDate(r.created_at)}</p></li>)}</ul>
          </div>
        ) : <p className="mt-2 text-sm text-charcoal-500">No reviews yet. Reviews appear here after verified buyers share their experience.</p>}
        <ReviewForm slug={slug} onDone={rev.reload} />
      </section>

      {(p.related?.length ?? 0) > 0 && (
        <section className="mt-14" aria-labelledby="rel-h"><h2 id="rel-h" className="text-2xl font-extrabold">You may also like</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{p.related!.map((r) => <ProductCard key={r.id} p={r} />)}</div></section>
      )}
    </div>
  )
}
