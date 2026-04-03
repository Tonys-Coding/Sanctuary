# Sanctuary

Minimal README for the Sanctuary church management project.

This repository contains a full-stack app with a Node/Express backend and a Vite + React + TypeScript frontend.

Quick start (dev)

1. Backend

```bash
cd backend
npm install
npm run dev
```

By default the backend server lives in `backend/src` and serves APIs. See `backend/package.json` for scripts.

2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend is a Vite app in `frontend/` and will open on a dev server (usually http://localhost:5173).

Notes

- Environment variables: add `.env` files as needed for the backend (DB credentials, JWT secrets).
- Uploaded files (backend/public/uploads) are intentionally ignored by `.gitignore`.
- This is a minimal README. Add contribution, license, CI, and detailed setup instructions as needed.

License

Add a license file if you plan to publish this repository.
