import { useEffect } from 'react'
import { site } from '../config/site'

function setMeta(selector: string, attr: string, key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.content = content
}

/** Sets the page title, description and (optional) structured data for search engines and social sharing. */
export function Seo({ title, description, image, jsonLd, noindex }: { title: string; description?: string; image?: string | null; jsonLd?: object; noindex?: boolean }) {
  useEffect(() => {
    const full = title.includes(site.name) ? title : `${title} | ${site.name}`
    document.title = full
    if (description) {
      setMeta('meta[name="description"]', 'name', 'description', description)
      setMeta('meta[property="og:description"]', 'property', 'og:description', description)
    }
    setMeta('meta[property="og:title"]', 'property', 'og:title', full)
    if (image) setMeta('meta[property="og:image"]', 'property', 'og:image', image)
    setMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    let script: HTMLScriptElement | null = null
    if (jsonLd) {
      script = document.createElement('script'); script.type = 'application/ld+json'; script.text = JSON.stringify(jsonLd); document.head.appendChild(script)
    }
    return () => { script?.remove() }
  }, [title, description, image, jsonLd, noindex])
  return null
}
