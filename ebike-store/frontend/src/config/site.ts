// Public (non-secret) settings. Change them in frontend/.env - no code edits needed.
const env = import.meta.env
export const site = {
  name: (env.VITE_SITE_NAME as string) || 'VoltRide',
  tagline: 'Ride Further. Live Freer. Go Electric.',
  contactEmail: (env.VITE_CONTACT_EMAIL as string) || '',
  contactPhone: (env.VITE_CONTACT_PHONE as string) || '',
  address: (env.VITE_CONTACT_ADDRESS as string) || '',
  heroImage: (env.VITE_HERO_IMAGE_URL as string) || '',
  apiBase: (env.VITE_API_URL as string) || '',
}
