import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { LinkButton, SectionHeading } from '../components/ui'
import { site } from '../config/site'

export function About() {
  return (
    <>
      <Seo title="About Us" description={`Learn about ${site.name}: electric bicycles chosen for quality, honest specifications and secure shopping.`} />
      <div className="bg-charcoal-950 py-16 text-white"><div className="container-x"><h1 className="max-w-3xl text-4xl font-extrabold !text-white">Electric bikes, made simple.</h1><p className="mt-4 max-w-2xl text-lg text-charcoal-300">{site.name} exists to make switching to an electric bicycle easy, honest and enjoyable.</p></div></div>
      <div className="container-x grid gap-12 py-16 lg:grid-cols-2">
        <div><SectionHeading title="What we believe" /><div className="mt-4 space-y-4 text-charcoal-600"><p>Buying an e-bike should not require a degree in electronics. So every bike in our shop lists its motor power, battery capacity, advertised range, weight and brakes in plain view.</p><p>We keep stock levels live, charge the price you see, and use a secure payment provider so your payment details never touch our servers.</p><p>Have a question about which bike fits your commute, terrain or budget? Ask us. We are happy to help you choose.</p></div></div>
        <ul className="grid gap-4">{[['Clear specifications', 'Compare bikes on the numbers that matter.'], ['Fair, visible pricing', 'The price on the page is the price you pay, plus delivery shown at checkout.'], ['Secure by design', 'Encrypted connections and no card details stored on our systems.']].map(([t, d]) => <li key={t} className="card p-6"><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm text-charcoal-600">{d}</p></li>)}</ul>
      </div>
      <div className="container-x pb-16"><LinkButton to="/shop">Browse the bikes</LinkButton></div>
    </>
  )
}

export function Contact() {
  const has = site.contactEmail || site.contactPhone || site.address
  return (
    <>
      <Seo title="Contact" description={`Contact ${site.name} for help choosing or ordering an electric bicycle.`} />
      <div className="bg-charcoal-950 py-14 text-white"><div className="container-x"><h1 className="text-4xl font-extrabold !text-white">Contact us</h1><p className="mt-3 text-charcoal-300">We would love to help you find the right bike.</p></div></div>
      <div className="container-x max-w-2xl py-14">
        {has ? (
          <ul className="space-y-4">
            {site.contactEmail && <li className="card p-6"><h2 className="text-sm font-bold uppercase tracking-widest text-charcoal-500">Email</h2><a className="mt-1 block text-lg font-semibold text-volt-700 hover:underline" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></li>}
            {site.contactPhone && <li className="card p-6"><h2 className="text-sm font-bold uppercase tracking-widest text-charcoal-500">Phone / WhatsApp</h2><a className="mt-1 block text-lg font-semibold text-volt-700 hover:underline" href={`tel:${site.contactPhone.replace(/\s/g, '')}`}>{site.contactPhone}</a></li>}
            {site.address && <li className="card p-6"><h2 className="text-sm font-bold uppercase tracking-widest text-charcoal-500">Visit us</h2><p className="mt-1 text-lg">{site.address}</p></li>}
          </ul>
        ) : <div className="card p-8 text-center"><h2 className="text-lg font-bold">Contact details are not set yet</h2><p className="mt-2 text-sm text-charcoal-500">The store owner can add email, phone and address in <code>frontend/.env</code> (VITE_CONTACT_EMAIL, VITE_CONTACT_PHONE, VITE_CONTACT_ADDRESS).</p></div>}
        <p className="mt-8 text-sm text-charcoal-500">Ordering? Have your order number ready (find it in your <Link className="text-volt-700 hover:underline" to="/account/orders">order history</Link>).</p>
      </div>
    </>
  )
}

export function NotFound() {
  return <div className="container-x py-24 text-center"><Seo title="Page not found" noindex /><p className="font-display text-6xl font-extrabold text-volt-600">404</p><h1 className="mt-2 text-3xl font-extrabold">Page not found</h1><p className="mt-2 text-charcoal-500">The page you are looking for does not exist.</p><LinkButton to="/" className="mt-6">Back to home</LinkButton></div>
}
