# NexusAI

NexusAI is a self-hosted AI chat platform built with React, Vite, Express, TypeScript, and MongoDB. It supports streaming AI conversations, custom assistants, document-based Q&A, and guest or registered user sessions.

## Project structure

```
nexus-ai/
├── frontend/            React + Vite single-page app
│   ├── src/             App source (pages, components, hooks, api client)
│   ├── public/          Static assets (logo, manifest, Netlify _redirects)
│   ├── Dockerfile       Builds the app and serves it with Nginx
│   ├── nginx.conf       SPA fallback + /api proxy (used by Docker Compose)
│   ├── vercel.json      SPA rewrite for Vercel
│   └── .env.example     Public build-time variables (VITE_*)
├── backend/             Express + MongoDB API
│   ├── src/             Server source (routes, controllers, services, models)
│   ├── Dockerfile
│   └── .env.example     Server secrets and provider keys
├── docs/integrations.md AI provider / email / Vly configuration
├── DEPLOYMENT.md        Deployment guide and checklist
├── SECURITY-AUDIT.md    Audit findings and verification results
├── docker-compose.yml   Full stack: MongoDB + backend + frontend
└── .env.example         Variables used by docker-compose.yml
```

## Local development

```bash
npm run install:all                         # installs backend + frontend deps
cp backend/.env.example backend/.env        # then edit backend/.env
npm run dev        # http://localhost:5173 (also starts the backend on :5000)
```

Run these from the project root (the root `package.json` forwards to `frontend/` and `backend/`).

## Tests and checks

```bash
npm test            # backend E2E + security suite (in-memory MongoDB, mocked AI)
npm run lint        # frontend ESLint
npm run typecheck   # backend + frontend TypeScript
npm run build       # production builds
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting options, required environment
variables, MongoDB Atlas setup and the post-deploy checklist.
