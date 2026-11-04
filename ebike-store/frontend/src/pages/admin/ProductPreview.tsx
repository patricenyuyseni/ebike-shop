import { useParams } from 'react-router-dom'
import { ProductView } from '../../components/ProductView'
import { Alert, ErrorState, LinkButton, PageLoader } from '../../components/ui'
import { api } from '../../lib/api'
import type { AdminProduct } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'

export default function ProductPreview() {
  const { id } = useParams()
  const res = useAsync((s) => api<AdminProduct>(`/api/admin/products/${id}`, { signal: s }), [id])
  if (res.loading) return <PageLoader />
  if (res.error || !res.data) return <ErrorState message={res.error?.message ?? 'Error'} />
  const p = res.data
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Alert kind={p.is_published ? 'success' : 'warning'}>{p.is_published ? 'This bike is published and visible to customers.' : 'DRAFT preview: customers cannot see this bike yet.'}</Alert><LinkButton to={`/admin/products/${p.id}`} variant="dark">← Back to editing</LinkButton></div>
      <div className="rounded-2xl bg-white p-6"><ProductView p={p} preview /></div>
    </div>
  )
}
