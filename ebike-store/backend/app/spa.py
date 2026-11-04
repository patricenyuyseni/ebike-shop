"""Serves the built React website from FastAPI (production, single domain).
- hashed asset files are cached for a year; index.html is never cached
- /robots.txt and /sitemap.xml are generated with your real domain
- product pages get correct <title>/description/social tags in the raw HTML (helps search engines & link previews)"""
import html
import re
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://res.cloudinary.com; "
       "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")


class ImmutableAssets(StaticFiles):
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        if resp.status_code == 200:
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp


def _inject(index: str, title: str, description: str, image: str | None = None, canonical: str | None = None) -> str:
    t, d = html.escape(title, quote=True), html.escape(description[:160], quote=True)
    out = re.sub(r"<title>.*?</title>", f"<title>{t}</title>", index, count=1, flags=re.S)
    tags = [f'<meta name="description" content="{d}" />', f'<meta property="og:title" content="{t}" />', f'<meta property="og:description" content="{d}" />', '<meta property="og:type" content="product" />']
    if image:
        tags.append(f'<meta property="og:image" content="{html.escape(image, quote=True)}" />')
    if canonical:
        tags.append(f'<link rel="canonical" href="{html.escape(canonical, quote=True)}" />')
    out = re.sub(r'<meta name="description"[^>]*>', "", out, count=1)
    return out.replace("</head>", "    " + "\n    ".join(tags) + "\n  </head>", 1)


def mount_frontend(app: FastAPI, dist: Path) -> None:
    from app.api.catalog import sitemap
    from app.models import Product
    from app.services.cart import primary_image
    from sqlalchemy import select

    index_html = (dist / "index.html").read_text(encoding="utf-8")
    base = settings.site_url.rstrip("/")
    if (dist / "assets").is_dir():
        app.mount("/assets", ImmutableAssets(directory=dist / "assets"), name="assets")

    def page(body: str) -> HTMLResponse:
        return HTMLResponse(body, headers={"Cache-Control": "no-cache", "Content-Security-Policy": CSP})

    @app.api_route("/robots.txt", methods=["GET", "HEAD"], include_in_schema=False)
    def robots():
        return PlainTextResponse("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /cart\n"
                                 f"Disallow: /order/\nDisallow: /pay/\nDisallow: /api/\n\nSitemap: {base}/sitemap.xml\n")

    @app.api_route("/sitemap.xml", methods=["GET", "HEAD"], include_in_schema=False)
    def sitemap_root(db: Session = Depends(get_db)):
        return sitemap(db)

    @app.api_route("/product/{slug}", methods=["GET", "HEAD"], include_in_schema=False)
    def product_page(slug: str, db: Session = Depends(get_db)):
        from app.api.catalog import _public
        p = db.scalar(_public(select(Product)).where(Product.slug == slug))
        if not p:
            return page(index_html)  # the React app shows its own "not found" message
        desc = (p.description or f"{p.name} electric bicycle").replace("\n", " ")
        return page(_inject(index_html, f"{p.name} | Electric Bicycle", desc, primary_image(p), f"{base}/product/{p.slug}"))

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(full_path: str, request: Request):
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse({"detail": "Not found."}, status_code=404)
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and dist.resolve() in candidate.parents:  # real file (favicon etc.), never outside dist
            return FileResponse(candidate, headers={"Cache-Control": "public, max-age=3600"})
        return page(index_html)
