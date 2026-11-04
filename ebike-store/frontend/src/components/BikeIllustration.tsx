/** Clean line illustration used when a product has no uploaded photo yet (and as the hero artwork). */
export function BikeIllustration({ className = '', animate = false }: { className?: string; animate?: boolean }) {
  const wheel = (cx: number) => (
    <g className={animate ? 'origin-center animate-wheel' : ''} style={{ transformOrigin: `${cx}px 190px`, transformBox: 'view-box' as never }}>
      <circle cx={cx} cy="190" r="62" strokeWidth="7" />
      <circle cx={cx} cy="190" r="6" fill="currentColor" />
      {[0, 45, 90, 135].map((a) => <line key={a} x1={cx} y1="132" x2={cx} y2="248" strokeWidth="1.5" opacity=".5" transform={`rotate(${a} ${cx} 190)`} />)}
    </g>
  )
  return (
    <svg viewBox="0 0 520 300" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Electric bicycle illustration">
      {wheel(120)}{wheel(400)}
      <path d="M120 190 195 100h140l65 90M195 100l55 90h-130M250 190l85-90" strokeWidth="7" />
      <path d="M335 100 320 62h-28M195 100l-10-24h-30" strokeWidth="7" />
      <rect x="226" y="150" width="62" height="26" rx="8" fill="#12e068" stroke="none" />
      <circle cx="250" cy="190" r="14" strokeWidth="6" />
      <path d="M232 82h-32" strokeWidth="9" />
    </svg>
  )
}
