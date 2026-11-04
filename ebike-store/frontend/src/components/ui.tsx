import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50'
const variants = {
  primary: 'bg-volt-500 text-charcoal-950 shadow-sm hover:bg-volt-400 hover:shadow-glow',
  dark: 'bg-charcoal-950 text-white hover:bg-charcoal-800',
  outline: 'border border-charcoal-300 bg-white text-charcoal-900 hover:border-charcoal-900',
  ghostLight: 'border border-white/30 text-white hover:bg-white/10',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}
export type Variant = keyof typeof variants

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" /><path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
}

export function Button({ variant = 'primary', loading, children, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return <button {...p} disabled={p.disabled || loading} className={`${base} ${variants[variant]} ${className}`}>{loading && <Spinner className="h-4 w-4" />}{children}</button>
}

export function LinkButton({ variant = 'primary', className = '', ...p }: LinkProps & { variant?: Variant }) {
  return <Link {...p} className={`${base} ${variants[variant]} ${className}`} />
}

interface FieldProps { label: string; error?: string; hint?: string }
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input({ label, error, hint, className = '', ...p }, ref) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}{p.required && <span className="text-red-600"> *</span>}</label>
      <input ref={ref} id={id} {...p} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} className={`field ${error ? 'field-error' : ''}`} />
      {hint && !error && <p id={`${id}-h`} className="mt-1 text-xs text-charcoal-500">{hint}</p>}
      {error && <p id={`${id}-e`} role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
})

export function Select({ label, error, className = '', children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} {...p} aria-invalid={!!error} className={`field ${error ? 'field-error' : ''}`}>{children}</select>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <textarea id={id} {...p} aria-invalid={!!error} className={`field ${error ? 'field-error' : ''}`} />
      {error && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'warning' | 'info'; children: ReactNode }) {
  const c = { error: 'border-red-200 bg-red-50 text-red-800', success: 'border-volt-300 bg-volt-50 text-volt-900', warning: 'border-amber-300 bg-amber-50 text-amber-900', info: 'border-charcoal-200 bg-charcoal-50 text-charcoal-800' }[kind]
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${c}`}>{children}</div>
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'red' | 'amber' | 'dark' }) {
  const c = { gray: 'bg-charcoal-100 text-charcoal-700', green: 'bg-volt-100 text-volt-900', red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-900', dark: 'bg-charcoal-950 text-volt-400' }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-charcoal-100 ${className}`} />
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-charcoal-500"><Spinner className="h-6 w-6" /><span>{label}</span></div>
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-charcoal-200 px-6 py-14 text-center">
      <div className="mb-4 text-charcoal-300" aria-hidden="true">{icon ?? <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.2"><path d="M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-md text-sm text-charcoal-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <h3 className="text-lg font-semibold text-red-900">We couldn&apos;t load this</h3>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      {onRetry && <Button variant="dark" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-charcoal-950/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1 text-charcoal-500 hover:bg-charcoal-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, text, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose }: { open: boolean; title: string; text: string; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-charcoal-600">{text}</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'dark'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
      <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span className="text-sm text-charcoal-600">Page {page} of {pages}</span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
    </nav>
  )
}

export function Stars({ value }: { value: number }) {
  return <span aria-label={`${value} out of 5 stars`} className="text-amber-500">{'★'.repeat(Math.round(value))}<span className="text-charcoal-200">{'★'.repeat(5 - Math.round(value))}</span></span>
}

export function SectionHeading({ eyebrow, title, text, center }: { eyebrow?: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-volt-700">{eyebrow}</p>}
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-charcoal-600">{text}</p>}
    </div>
  )
}
