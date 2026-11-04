import { useState } from 'react'

const ITEMS = [
  ['How far can an electric bicycle go on one charge?', 'It depends on battery size, assist level, rider weight, terrain and wind. Every bike page lists the manufacturer\u2019s advertised range, which is measured in ideal conditions, so expect somewhat less in hilly or high-assist riding.'],
  ['How long does charging take?', 'Charging time is listed in each bike\u2019s specifications. Most batteries charge from empty to full in a few hours using a standard wall socket.'],
  ['Can I ride in the rain?', 'Electric bikes are designed for everyday weather, but avoid deep water and never pressure-wash the motor or battery. Dry the bike after wet rides and keep the charging port clean and dry.'],
  ['Do I need a licence or insurance?', 'Rules for electric bicycles differ by country and by motor power and top speed. Please check your local regulations before riding on public roads.'],
  ['How do I pay?', 'Payment is handled by a secure payment provider. We never see or store your card or mobile-money PIN details.'],
  ['What if an item is out of stock?', 'Stock levels shown on the site are live. If a bike sells out while you are checking out, we will tell you before any payment is taken.'],
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="divide-y divide-charcoal-100 rounded-2xl border border-charcoal-100 bg-white">
      {ITEMS.map(([q, a], i) => (
        <div key={q}>
          <h3>
            <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-charcoal-950 hover:text-volt-700" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)}>
              {q}<span aria-hidden="true" className={`text-xl text-volt-600 transition ${open === i ? 'rotate-45' : ''}`}>+</span>
            </button>
          </h3>
          <div id={`faq-${i}`} role="region" hidden={open !== i} className="px-5 pb-5 text-sm leading-relaxed text-charcoal-600">{a}</div>
        </div>
      ))}
    </div>
  )
}
