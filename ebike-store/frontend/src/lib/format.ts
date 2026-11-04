export function formatMoney(minor: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor).replace(/\u00a0/g, ' ')
  } catch {
    return `${currency === 'USD' ? '$' : ''}${minor.toLocaleString('en-US')}`
  }
}

export function discountPercent(price: number, original: number | null): number | null {
  if (!original || original <= price) return null
  return Math.round(((original - price) / original) * 100)
}

/** Cloudinary can resize and compress on the fly: we ask for a smaller, modern-format copy. */
export function optimizeImage(url: string | null | undefined, width = 600): string | null {
  if (!url) return null
  const marker = '/image/upload/'
  if (!url.includes('res.cloudinary.com') || !url.includes(marker)) return url
  return url.replace(marker, `${marker}f_auto,q_auto,c_limit,w_${width}/`)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Awaiting payment', paid: 'Paid', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered',
  cancelled: 'Cancelled', needs_review: 'Needs review',
}
export const PAYMENT_LABELS: Record<string, string> = { unpaid: 'Unpaid', paid: 'Paid', failed: 'Failed', refund_due: 'Refund due' }
