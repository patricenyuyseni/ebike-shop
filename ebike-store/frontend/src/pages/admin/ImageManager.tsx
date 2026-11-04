import { useRef, useState } from 'react'
import { Alert, Badge, Button, ConfirmDialog } from '../../components/ui'
import { useToast } from '../../context/Toast'
import { api, ApiError, uploadFile } from '../../lib/api'
import { useStoreConfig } from '../../lib/config'
import { optimizeImage } from '../../lib/format'
import type { ProductImage } from '../../lib/types'

interface Pending { id: number; file: File; preview: string; progress: number; state: 'ready' | 'uploading' | 'done' | 'error'; error?: string }
const OK = ['image/jpeg', 'image/png', 'image/webp']
let seq = 0

export function ImageManager({ productId, images, onChange }: { productId: number; images: ProductImage[]; onChange: () => void }) {
  const toast = useToast()
  const { max_upload_mb } = useStoreConfig()
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [remove, setRemove] = useState<ProductImage | null>(null)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')

  function pick(files: FileList | null) {
    if (!files) return
    const next: Pending[] = []; const bad: string[] = []
    for (const f of Array.from(files)) {
      if (!OK.includes(f.type)) bad.push(`${f.name}: only JPEG, PNG or WebP`)
      else if (f.size > max_upload_mb * 1024 * 1024) bad.push(`${f.name}: larger than ${max_upload_mb} MB`)
      else next.push({ id: ++seq, file: f, preview: URL.createObjectURL(f), progress: 0, state: 'ready' })
    }
    setNotice(bad.join('. ')); setPending((p) => [...p, ...next])
    if (input.current) input.current.value = ''
  }
  const patch = (id: number, u: Partial<Pending>) => setPending((p) => p.map((x) => (x.id === id ? { ...x, ...u } : x)))

  async function uploadAll() {
    setUploading(true)
    for (const p of pending.filter((x) => x.state === 'ready' || x.state === 'error')) {
      patch(p.id, { state: 'uploading', progress: 0, error: undefined })
      try { await uploadFile(`/api/admin/products/${productId}/images`, p.file, (pct) => patch(p.id, { progress: pct })); patch(p.id, { state: 'done', progress: 100 }) }
      catch (e) { patch(p.id, { state: 'error', error: e instanceof ApiError ? e.message : 'Upload failed' }) }
    }
    setUploading(false); onChange()
    setPending((list) => { list.filter((x) => x.state === 'done').forEach((x) => URL.revokeObjectURL(x.preview)); return list.filter((x) => x.state !== 'done') })
  }
  async function act(fn: () => Promise<unknown>, msg: string) { try { await fn(); toast(msg); onChange() } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed', 'error') } }
  const move = (i: number, d: number) => { const ids = images.map((x) => x.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; void act(() => api(`/api/admin/products/${productId}/images/order`, { method: 'PUT', body: { image_ids: ids } }), 'Order saved') }
  const waiting = pending.filter((p) => p.state === 'ready' || p.state === 'error').length

  return (
    <section className="card p-6" aria-labelledby="img-h">
      <h2 id="img-h" className="text-lg font-bold">Images</h2>
      <p className="text-sm text-charcoal-500">JPEG, PNG or WebP, up to {max_upload_mb} MB each. The first image (or the one marked primary) is shown in the shop.</p>
      {images.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{images.map((im, i) => (
          <li key={im.id} className="overflow-hidden rounded-xl border border-charcoal-200">
            <div className="relative aspect-[4/3] bg-charcoal-100"><img src={optimizeImage(im.url, 400) ?? ''} alt={im.alt_text} className="h-full w-full object-cover" />{im.is_primary && <span className="absolute left-2 top-2"><Badge tone="dark">Primary</Badge></span>}</div>
            <div className="flex flex-wrap gap-1 p-2">
              {!im.is_primary && <Button variant="outline" className="!px-2 !py-1 text-xs" onClick={() => act(() => api(`/api/admin/products/${productId}/images/${im.id}/primary`, { method: 'PATCH' }), 'Primary image set')}>Make primary</Button>}
              <Button variant="outline" className="!px-2 !py-1 text-xs" disabled={i === 0} aria-label="Move earlier" onClick={() => move(i, -1)}>◀</Button>
              <Button variant="outline" className="!px-2 !py-1 text-xs" disabled={i === images.length - 1} aria-label="Move later" onClick={() => move(i, 1)}>▶</Button>
              <Button variant="outline" className="!px-2 !py-1 text-xs !text-red-600" onClick={() => setRemove(im)}>Remove</Button>
            </div></li>))}</ul>
      )}
      <div className="mt-5">
        <input ref={input} id="img-input" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files)} />
        <label htmlFor="img-input" className="inline-flex cursor-pointer items-center rounded-xl border-2 border-dashed border-charcoal-300 px-5 py-3 text-sm font-semibold hover:border-volt-600 focus-within:outline">+ Choose images from your computer</label>
      </div>
      {notice && <div className="mt-3"><Alert kind="warning">{notice}</Alert></div>}
      {pending.length > 0 && (
        <div className="mt-4 space-y-3">
          <ul className="grid gap-3 sm:grid-cols-2">{pending.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-xl border border-charcoal-200 p-3">
              <img src={p.preview} alt="Preview" className="h-16 w-20 rounded-lg object-cover" />
              <div className="min-w-0 flex-1 text-sm"><p className="truncate font-medium">{p.file.name}</p><p className="text-xs text-charcoal-400">{(p.file.size / 1024).toFixed(0)} KB</p>
                {p.state === 'uploading' && <div className="mt-2"><div className="h-2 overflow-hidden rounded-full bg-charcoal-100" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-volt-500 transition-all" style={{ width: `${p.progress}%` }} /></div><p className="mt-0.5 text-xs">{p.progress}% {p.progress === 100 && '· processing…'}</p></div>}
                {p.state === 'error' && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{p.error}</p>}
                {p.state === 'ready' && <button className="mt-1 text-xs text-red-600 hover:underline" onClick={() => setPending((l) => l.filter((x) => x.id !== p.id))}>Remove from list</button>}</div></li>))}</ul>
          <Button loading={uploading} disabled={waiting === 0} onClick={uploadAll}>Upload {waiting} image{waiting === 1 ? '' : 's'}</Button>
        </div>)}
      <ConfirmDialog open={!!remove} danger title="Remove this image?" text="It will be removed from this bike and deleted from image storage." confirmLabel="Remove" onClose={() => setRemove(null)} onConfirm={async () => { const r = remove!; setRemove(null); await act(() => api(`/api/admin/products/${productId}/images/${r.id}`, { method: 'DELETE' }), 'Image removed') }} />
    </section>
  )
}
