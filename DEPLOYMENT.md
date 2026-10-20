# Deploying NexusAI

Two supported topologies. Pick one.

| | A. Separate hosts | B. Single host (Docker Compose) |
|---|---|---|
| Frontend | Vercel / Netlify (static) | Nginx container |
| Backend | Render / Railway / any Node 22 host | Node container |
| Database | MongoDB Atlas | MongoDB Atlas (recommended) or the bundled `mongo` container |
| Cookies | `COOKIE_SAMESITE=none` (different sites) or `lax` (same site) | `lax` (same origin) |
| HTTPS | Provided by the hosts | You must put HTTPS in front of port 8787 |

## Before anything else

1. **Rotate the Google AI API key.** The key that was in `backend/.env.example` is the key in use. Create a new key in Google AI Studio / Cloud Console, delete the old one, and put the new one only in the backend's secret settings.
2. Rotate any other credential that has ever been in a file you shared or committed (Groq key, MongoDB password).
3. Generate two different JWT secrets: `openssl rand -hex 32` (run twice).

## A. Separate hosts

### 1. MongoDB Atlas
- Create a dedicated database user for production with **readWrite on the `nexusai` database only**.
- Network Access: allow only your backend host's egress IPs. Render/Railway free tiers have no fixed IPs. Use their static-IP add-on or private networking; `0.0.0.0/0` is a temporary last resort, not a permanent setting.
- Atlas connections use TLS by default (`mongodb+srv://`). Enable backups (continuous or daily snapshots) and test a restore once.

### 2. Backend (Render / Railway)
- Root directory: `backend` · Build: `npm ci && npm run build` · Start: `npm start`
- Node 22. Health check path: `/api/health` (returns 503 if the database is unreachable). `/health` is a liveness-only probe.
- Environment variables (set in the host's secret settings, never in files):

| Variable | Required | Value |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `MONGODB_URI` | yes | Atlas URI |
| `JWT_ACCESS_SECRET` | yes | 64 hex chars, unique |
| `JWT_REFRESH_SECRET` | yes | 64 hex chars, different from the access secret |
| `CLIENT_URL` | yes | Frontend origin, e.g. `https://nexusai.vercel.app` (comma-separate several) |
| `COOKIE_SAMESITE` | yes | `none` if frontend and API are on different sites; `lax` if same site (e.g. `app.example.com` + `api.example.com`) |
| `TRUST_PROXY` | no | `1` (default) |
| `ENABLE_DEV_OTP` | no | leave unset or `false`; `true` is refused |
| `GROQ_API_KEY` / `GOOGLE_AI_API_KEY` / `OPENAI_API_KEY` | at least one for real models | provider keys |
| `DEFAULT_AI_MODEL` | no | e.g. `qwen/qwen3.8-27b` |
| `MAX_OUTPUT_TOKENS` | no | default `2048` |
| `MAX_CONCURRENT_GENERATIONS` | no | default `2` per user |
| `RESEND_API_KEY`, `OTP_FROM_EMAIL` | for email-code sign-in | Resend key and a verified sender |
| `ADMIN_EMAILS` | no | allowlist for the first admin claim |

The server refuses to start if a required value is missing, short, a placeholder, if the two JWT secrets match, or if `CLIENT_URL` is not an https origin.

### 3. Frontend (Vercel / Netlify)
- Root directory: `frontend` · Build: `npm ci && npm run build` · Output: `dist`
- Environment: `VITE_API_URL=https://<backend-host>/api`. This is the only frontend variable. Never put keys or the database URI in `VITE_*` variables; they are public.
- `vercel.json` (Vercel) and `public/_headers` + `public/_redirects` (Netlify) provide the SPA fallback and security headers (CSP, `frame-ancestors 'none'`, nosniff).

### 4. After the first deploy
1. Open the frontend, sign in with an **email code** using an address in `ADMIN_EMAILS`, then open Admin → Claim. Or, from a shell with production env: `npm run grant-admin -- you@example.com`.
2. Check `https://<backend>/api/health` → `{"status":"ok","database":"connected"}`.
3. Send a chat message and confirm the reply streams in progressively.

### Cross-site caveat (Safari / strict cookie settings)
With frontend and API on different sites (`*.vercel.app` + `*.onrender.com`), browsers that block third-party cookies (Safari by default) keep only the 15-minute Bearer token and sign the user out when it expires. For reliable sessions, serve both from one site: a custom domain with `app.example.com` and `api.example.com`, and set `COOKIE_SAMESITE=lax`. Or use topology B.

## B. Single host (Docker Compose)

```bash
cp .env.example .env      # fill JWT secrets, CLIENT_URL=https://your-domain, keys
docker compose up --build -d
```

- Nginx serves the app and proxies `/api` (SSE-safe: buffering off, 1 h read timeout, 13 MB body limit).
- Put HTTPS in front of port 8787 (Caddy, a cloud load balancer, or a host Nginx with Let's Encrypt). `CLIENT_URL` must be that https origin.
- MongoDB is not published outside the Compose network. Back up the `mongo-data` volume (`mongodump`), or point `MONGODB_URI` at Atlas instead.

## Operations

- **Logs** never include passwords, tokens, OTPs, keys or the database URI. AI provider errors are logged server-side and shown to users only as generic messages.
- **Rate limits** live in process memory. With more than one backend instance, each instance counts separately. Use one instance, or add a shared store (e.g. Redis via `rate-limit-redis`) before scaling out.
- **Streams** are held in memory per instance. Multiple instances need sticky sessions so `/api/chat` and `/api/stream/:id` hit the same instance.
- **AI costs:** set spending limits/alerts in each provider dashboard. Per-user limits: 20 generations/min, 300/hour, 2 concurrent, `MAX_OUTPUT_TOKENS` per reply.
- **Rollback:** redeploy the previous build on each host (Render/Vercel keep prior deploys). Schema changes in this release are additive (new optional fields `familyId`, `emailVerified`), so rolling back needs no data migration.
- **Seed/migration safety:** startup never drops, resets or seeds data. Mongoose only creates missing indexes.
- **Tests** (`npm test` in `backend/`) use an in-memory MongoDB, run with `NODE_ENV=test` (which skips `backend/.env`), and refuse to connect to any non-local database.

## Data sent to third parties

- Chat messages, attachments and retrieved document excerpts are sent to the selected AI provider (Groq, Google, OpenAI or the Vly gateway). Their retention policies apply. Tell your users in a privacy notice.
- If `OPENAI_API_KEY` is set, uploaded document text is sent to OpenAI for embeddings.
- Email addresses are sent to Resend for sign-in codes.
- The frontend loads fonts from Google Fonts.
