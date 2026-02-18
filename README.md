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

## Frontend env (`frontend/.env`)

```env
VITE_API_BASE_URL=https://your-backend-service.onrender.com
VITE_DEV_API_TARGET=http://localhost:3000
```

- `VITE_API_BASE_URL` is used in production builds.
- `VITE_DEV_API_TARGET` is used only by Vite dev proxy.

## Backend env (`backend/.env`)

See `backend/.env.example`.

Important for ABC:

```env
ABC_BINARY=/usr/local/bin/abc
```
