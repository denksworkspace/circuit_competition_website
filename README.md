# circuit_control_version

Project is split into two apps:

- `frontend/` (Vite + React) -> deploy to Vercel
- `backend/` (API + ABC runtime) -> deploy to Render

## Local development

Install dependencies:

```bash
cd frontend && npm install
cd ../backend && npm install
```

Run frontend:

```bash
npm run dev --prefix frontend
```

Run backend:

```bash
npm run dev --prefix backend
```

Run backend DB migration (points lifecycle/status schema safety):

```bash
npm run db:migrate --prefix backend
```

## Frontend env (`frontend/.env`)

```env
VITE_API_BASE_URL=https://your-backend-service.onrender.com
VITE_DEV_API_TARGET=http://localhost:3000
```

- `VITE_API_BASE_URL` is used in production builds.
- `VITE_DEV_API_TARGET` is used only by Vite dev proxy.
- Direct frontend API routes (`/api/points-direct`, `/api/points-upload-url-direct`) are deprecated.

## Backend env (`backend/.env`)

See `backend/.env.example`.

Important for ABC:

```env
ABC_BINARY=/usr/local/bin/abc
```

Queue upload flow env (backend):

```env
S3_BUCKET=primary-points-bucket
QUEUE_S3_BUCKET=queue-temp-bucket
QUEUE_CLOUDFRONT_DOMAIN=your-cloudfront-domain.example.com
QUEUE_S3_PREFIX=queue
APP_DEPLOY_MAX_DRIFT_SECONDS=1800
# Optional explicit backend build timestamp (ms). If unset, backend start time is used.
APP_BUILD_TS=
```

- Frontend adds `x-frontend-build-ts` automatically for `/api/*`.
- Backend compares it with backend build/start timestamp and enters maintenance mode on large drift.
- Drift threshold is controlled by `APP_DEPLOY_MAX_DRIFT_SECONDS` (set `0` to disable this guard).
