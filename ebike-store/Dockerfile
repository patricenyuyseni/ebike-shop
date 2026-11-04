# Builds ONE image containing the website (React) and the API (FastAPI).   NOT tested here: Docker was unavailable in the build sandbox.
# Build from the project root:   docker build -t ebike-store .
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Public (non-secret) branding, baked into the website at build time
ARG VITE_SITE_NAME=VoltRide
ARG VITE_CONTACT_EMAIL=
ARG VITE_CONTACT_PHONE=
ARG VITE_CONTACT_ADDRESS=
ARG VITE_HERO_IMAGE_URL=
ENV VITE_SITE_NAME=$VITE_SITE_NAME VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL VITE_CONTACT_PHONE=$VITE_CONTACT_PHONE VITE_CONTACT_ADDRESS=$VITE_CONTACT_ADDRESS VITE_HERO_IMAGE_URL=$VITE_HERO_IMAGE_URL
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 APP_ENV=production FRONTEND_DIST=/app/frontend_dist
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /app/frontend_dist
RUN useradd --create-home --uid 10001 app && chown -R app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/api/health'%os.environ.get('PORT','8000'))"
# Applies database migrations, then starts the server. Secrets come from environment variables, never from the image.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --workers ${WEB_CONCURRENCY:-1}"]
