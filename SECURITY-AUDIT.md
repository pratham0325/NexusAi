# NexusAI — Security & Production-Readiness Audit

Audit date: 2026-10-17. Scope: `frontend/` (React/Vite), `backend/` (Express/Mongoose), Docker/Nginx/Compose, env templates. The repository is not under git, so no history scan was possible.

## A. Executive summary

**Readiness: ready to deploy after the manual actions in section F.** The most important one is rotating the exposed Google AI key. All automated checks that could run locally pass. Docker image builds, real AI provider calls and email delivery were not verified (see G).

Critical / high issues found (all fixed in code unless marked):

| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | Critical | Live Google AI API key committed in `backend/.env.example` (hash-matched to the key in use) | Removed from file. **Key must be rotated (manual).** |
| 2 | Critical | Production bundle shipped `@vly-ai/integrations` screenshot listener: any site framing the app could request a full-page screenshot of a signed-in user's screen via `postMessage`, no interaction needed. No frame-blocking headers existed. | Fixed: Vly plugin/toolbar/route-sync are dev-only; `frame-ancestors 'none'` + `X-Frame-Options: DENY` on all hosts |
| 3 | High | Admin claim trusted unverified emails: anyone could password-register an unused `ADMIN_EMAILS` address and claim admin | Fixed: claim requires an email-code-verified address; `grant-admin` CLI added |
| 4 | High | No CSRF defense while production cookies are `SameSite=None` (regenerate, logout, claim, etc. forgeable cross-site) | Fixed: Origin/Referer allowlist check on all state-changing `/api` requests |
| 5 | High | Refresh token returned in JSON and mirrored to `localStorage`; accepted from an `x-refresh-token` header | Fixed: cookie-only refresh, JSON never contains it, legacy storage purged |
| 6 | High | No refresh-token reuse detection | Fixed: token families; replay revokes the family |
| 7 | High | Nginx 1 MB default body limit broke attachment/document uploads in the Docker deployment | Fixed: 13 MB limit |
| 8 | Medium | JWT verification accepted any algorithm, no issuer/audience | Fixed: HS256 only, `iss`/`aud`, subject format check |
| 9 | Medium | OTP from `Math.random`, non-atomic attempt counter, unlimited fresh codes per address | Fixed: `crypto.randomInt`, atomic attempts, single-use, 3 codes/10 min per address |
| 10 | Medium | `/api/health` always reported "connected" | Fixed: real readiness, 503 when DB is down |
| 11 | Medium | Malformed ids / bad JSON / oversized bodies → 500; global 12 MB body limit | Fixed: 404/400/413 mapping; 100 KB default, large limits only on upload routes |
| 12 | Medium | No output-token cap, no concurrency cap, no timeout on non-streaming provider calls; generation rate limit keyed by IP | Fixed: `MAX_OUTPUT_TOKENS`, 2 concurrent/user, 90 s timeout, per-user 20/min + 300/h |
| 13 | Medium | Provider/config error text (e.g. "key not configured in backend/.env") streamed to users | Fixed: generic user messages, details logged server-side |
| 14 | Medium | RAG excerpts injected as trusted system text | Fixed: fenced as untrusted data with explicit instructions; owner-scoped name lookup |
| 15 | Medium | Unbounded document chunking (8 M chars → thousands of embeddings, over OpenAI's per-request limit) | Fixed: 1.5 M chars / 1,500 chunks, batched embeddings with timeout |
| 16 | Medium | E2E harness ran with `NODE_ENV=development`, so it loaded `backend/.env` (real keys and settings) | Fixed: `NODE_ENV=test` (skips `.env`) + connection guard refusing non-local hosts in test |
| 17 | Low | Login timing revealed account existence; bcrypt cost 10 | Fixed: dummy-hash comparison; cost 12 for new hashes (old hashes still verify) |
| 18 | Low | `clearCookie` attributes didn't match `cookie` attributes (logout might not clear in prod) | Fixed |
| 19 | Low | Weak production config gate (placeholder secrets, identical secrets, wildcard/http `CLIENT_URL` accepted) | Fixed |
| 20 | Low | Search query unbounded; extra-match lookup not owner-scoped | Fixed: 200 chars, owner filter, per-user limit |

## B. Security fixes implemented

- **JWT & refresh tokens:** HS256-only verification with issuer/audience; configurable TTL (`ACCESS_TOKEN_TTL_MINUTES`); refresh tokens hashed at rest (unchanged), rotated on use, grouped in families, reuse after a 10 s grace window revokes the family; logout revokes the family; cookie-only refresh; cookies `HttpOnly`, `Secure` in production, `SameSite` configurable (`COOKIE_SAMESITE`); matching clear attributes.
- **Auth & authorization:** verified-email requirement for admin claim; `emailVerified` set by email-code sign-in; `grant-admin` CLI; `requireAdmin` re-checks the DB role; timing-equalized login; OTP hardening (crypto RNG, atomic attempts, single use, per-address cap). Ownership checks were already present on every resource route and are now covered by regression tests.
- **CORS & CSRF:** explicit origin allowlist (no reflection), explicit methods/headers, credentials only for allowed origins; Origin/Referer CSRF check for non-GET `/api` requests.
- **Input validation:** ObjectId regex on body ids, UUID stream ids, max lengths on login/search/document ids; CastError → 404; body-parser errors → 400/413; per-route body limits.
- **AI providers:** server-side model allowlist (unchanged, now tested), `max_tokens`, request timeouts, concurrency cap, per-user limits, sanitized error messages.
- **RAG & documents:** untrusted-data fencing, owner-scoped retrieval and name lookup, chunk/size caps, batched embeddings with timeout.
- **Database:** test-mode connection guard, no URI in errors/logs, pool size, clean shutdown.
- **Rate limiting:** global 300 req/min/IP on `/api`; login/register 10, OTP request 5, OTP verify 10, guest 20, refresh 60 per 15 min/IP; per-user generation/doc/search/admin limits.
- **Frontend:** Vly editor tooling dev-only; refresh-token storage removed; CSP, `frame-ancestors 'none'`, `X-Frame-Options`, nosniff, Referrer-Policy, Permissions-Policy on Vercel, Netlify and Nginx. Markdown rendering was already safe (no raw HTML, `javascript:` URLs filtered).
- **Server/Docker:** Helmet CSP for the API, `x-powered-by` off, SSE-safe Node timeouts, shutdown timeout, unhandled-rejection logging; Nginx body limit, forwarded headers, JSON 404s for unknown `/api` paths, asset caching, `server_tokens off`; Compose sets `COOKIE_SAMESITE=lax`, `TRUST_PROXY=1`.

## C. Files changed

| File | Change |
|---|---|
| `backend/src/config/env.ts` | New settings, stricter production gate, dev loopback origins |
| `backend/src/config/mongo.ts` | Test-mode local-only guard, pool size |
| `backend/src/app.ts` | CORS allowlist, CSRF check, body limits, readiness health, rate limits, error mapping |
| `backend/src/server.ts` | Timeouts, shutdown, rejection logging |
| `backend/src/middleware/auth.ts` | Pinned JWT verification, DB-backed admin guard |
| `backend/src/services/auth/session.ts` | Token families, reuse detection, cookie-only refresh |
| `backend/src/services/auth/auth.service.ts` | OTP, login timing, bcrypt cost, email verification |
| `backend/src/controllers/auth.controller.ts` | No refresh token in JSON |
| `backend/src/controllers/misc.controller.ts` | Verified-email admin claim |
| `backend/src/controllers/chat.controller.ts` | Concurrency cap, safe error messages |
| `backend/src/controllers/conversations.controller.ts` | Search bounds and owner scoping |
| `backend/src/services/{chat,rag,ai,streaming}/*` | HttpErrors, RAG fencing, caps, timeouts, token limits |
| `backend/src/validators/index.ts` | Tighter id/length/document limits |
| `backend/src/models/{User,RefreshToken}.ts` | `emailVerified`, `familyId` (additive) |
| `backend/src/cli/grant-admin.ts` | New: server-side admin provisioning |
| `backend/src/e2e.ts` | Test-mode isolation; 38 new security regression checks |
| `backend/.env.example`, `.env.example`, `frontend/.env.example` | Placeholders only, new settings documented |
| `frontend/src/main.tsx`, `frontend/vite.config.ts` | Vly tooling dev-only |
| `frontend/src/api/{client,index}.ts` | Refresh-token storage/header removed |
| `frontend/nginx.conf`, `frontend/vercel.json`, `frontend/public/_headers` | Security headers, body limit, SSE proxy |
| `frontend/src/hooks/use-mobile.ts`, `src/components/ui/{carousel,sidebar}.tsx` | Fixed 3 pre-existing lint errors |
| `docker-compose.yml` | Cookie/proxy/limit settings, accurate scope notes |
| `.github/workflows/ci.yml` | New minimal CI (no secrets, read-only permissions) |
| `DEPLOYMENT.md`, `README.md`, `docs/integrations.md` | Deployment guide and updated docs |

## D. Test results

| Command | Result | Notes |
|---|---|---|
| `npm test` (backend E2E, in-memory MongoDB) | PASS — 96/96 | Baseline before changes: 58/58. Includes JWT forgery/expiry, refresh rotation/replay/family revocation, logout revocation, OTP reuse, CSRF, CORS, malformed ids, NoSQL operators, 413/400 handling, model allowlist, cross-user conversation/message/export/stream/stop/document/assistant access, role tampering, readiness, production config gate |
| `npm run typecheck` (backend + frontend) | PASS | |
| `npm run lint` (frontend) | PASS — 0 errors, 14 warnings | Warnings are React fast-refresh hints |
| `npm run build` (backend + frontend) | PASS | Prod bundle verified: no inline scripts, no Vly screenshot/toolbar/route-sync code |
| Production-like proxy check (compiled backend, `NODE_ENV=production`, in-memory DB, `vite preview` proxy) | PASS — 15/15 | SPA fallback, JSON 404 for unknown API, Secure/HttpOnly/SameSite cookies, incremental SSE through proxy, CSRF rejection, no internals in errors, API security headers |
| Dev boot with real `backend/.env` | PASS | Health `connected`; no data written (Mongoose may add the new `familyId` index) |
| `npm audit --omit=dev` (backend) | PASS — 0 | Also 0 including dev dependencies |
| `npm audit` (frontend) | 3 moderate | `mammoth → argparse → sprintf-js`; argparse is mammoth's CLI only, not in the browser bundle; only "fix" is a breaking downgrade |
| Docker image builds / `docker compose up` | NOT VERIFIED | Docker daemon not running on this machine |
| Real AI provider calls (Groq/Gemini/OpenAI) | NOT VERIFIED | Tests use the demo model and a mocked provider |
| Resend email delivery | NOT VERIFIED | No production email key used |
| Secret scan | Working tree only | Only `backend/.env` holds secrets (gitignored and dockerignored). No git history exists to scan |

## E. Environment configuration

See the table in `DEPLOYMENT.md`. Summary:
- **Backend host secrets:** `NODE_ENV`, `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`, `COOKIE_SAMESITE`, provider keys, `RESEND_API_KEY`, `OTP_FROM_EMAIL`, `ADMIN_EMAILS`, optional `MAX_OUTPUT_TOKENS`, `MAX_CONCURRENT_GENERATIONS`, `TRUST_PROXY`, `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS`.
- **Frontend host:** `VITE_API_URL` only (public).
- **Compose:** root `.env` (see `.env.example`).
- `OPENROUTER_API_KEY` is not used: OpenRouter is not implemented. Implemented providers: Groq, Google Gemini (OpenAI-compatible endpoint), OpenAI or compatible, Vly gateway, built-in demo.

## F. Manual actions

1. **Rotate the Google AI API key** (Google AI Studio / Cloud Console). Review the Groq key and MongoDB password too if those files were ever shared.
2. **MongoDB Atlas:** dedicated least-privilege user; IP allowlist for the backend host (avoid permanent `0.0.0.0/0`); enable backups; test a restore.
3. **AI provider dashboards:** set spending limits and usage alerts.
4. **Resend:** verify a sending domain and set `OTP_FROM_EMAIL` (needed for email-code sign-in, and therefore for claiming admin).
5. **Hosting:** set the env vars above; health check `/api/health`; HTTPS (automatic on Vercel/Render; required in front of Compose).
6. **First admin:** sign in with an email code using an `ADMIN_EMAILS` address, then claim; or run `npm run grant-admin -- <email>` with production env.
7. **Possible earlier test contamination (read-only check, nothing was deleted):** in Atlas → Browse Collections → `users`, filter `{ email: { $in: ["ada@example.com", "grace@example.com", "smoke@test.dev"] } }` and `{ email: { $regex: "^smoke_" } }`. If matches exist, export them first, then delete those users and their `conversations`/`messages`/`documents`/`documentchunks`/`assistants`/`usersettings`/`usageevents`/`refreshtokens` by `userId`. Only do this after confirming.
8. Delete the leftover root `node_modules/` folder (it was locked while the dev server ran; nothing uses it).

## G. Remaining risks

- **Account pre-hijacking:** password sign-up does not verify email. A squatter can register someone's address; if the owner later signs in by email code, they get into the squatter's account, and the squatter's password still works. Fix options: require email verification for password accounts, or clear the password when an unverified account is first claimed by email code. Not changed, to preserve the current sign-up flow.
- **Registration enumeration:** `register` returns "email already exists". Common UX trade-off; rate-limited.
- **Cross-site deployments:** with frontend and API on different sites, Safari and other third-party-cookie blockers keep only the 15-minute Bearer token. Users get signed out more often. The access token lives in `sessionStorage` and is readable by any XSS. Same-site hosting avoids both problems.
- **Single-instance assumptions:** rate limits and stream state are in process memory. Scaling out needs a shared store and sticky sessions.
- **CSRF** relies on browsers sending Origin/Referer (all current browsers do on cross-site writes); there is no token-based CSRF.
- **Uploads:** documents are extracted in the browser and sent as text, so the server never parses files; images are validated by MIME and data-URL format, not decoded. Attachments are stored in MongoDB (16 MB document limit). No malware scanning or OCR exists.
- **Embeddings:** if OpenAI embeddings fail mid-way, local fallback vectors (a different vector space) get stored, which degrades retrieval quality for that document.
- **Transport-failure retry:** one non-streaming retry after a network error with no output can bill one extra provider request.
- **No account deletion feature** exists; user data retention is indefinite.
- **CSP** allows `'unsafe-inline'` styles (required by the syntax highlighter and animation libraries) and `connect-src https:` on Vercel/Netlify, because the API origin is configured at deploy time.
- `/api/admin/stats` returns `data: null` (not 403) to non-admins. The admin UI relies on this; no data is exposed.

## H. Final readiness checklist

| Item | Status |
|---|---|
| Exposed Google AI key rotated | MANUAL ACTION REQUIRED |
| JWT/refresh/cookie hardening | PASS |
| Authorization & cross-user isolation | PASS |
| Admin provisioning | PASS |
| CORS / CSRF | PASS |
| Input validation & error handling | PASS |
| Production config gate | PASS |
| AI model allowlist & cost limits | PASS (mocked provider) |
| Real provider routing (Groq/Gemini/OpenAI) | NOT VERIFIED |
| RAG ownership & prompt-injection fencing | PASS |
| SSE through a proxy | PASS (`vite preview` proxy) |
| E2E database isolation | PASS |
| Frontend production bundle (no editor/screenshot hooks) | PASS |
| Security headers (Vercel/Netlify/Nginx configs) | PASS (config written; live host headers NOT VERIFIED) |
| Backend/frontend builds, typecheck, lint | PASS |
| Dependency audit | PASS backend · 3 moderate frontend (not reachable in browser) |
| Docker images / Compose | NOT VERIFIED |
| Email OTP delivery (Resend) | NOT VERIFIED |
| Atlas network access, least-privilege user, backups | MANUAL ACTION REQUIRED |
| Provider spending limits | MANUAL ACTION REQUIRED |
| Earlier test-data contamination check | MANUAL ACTION REQUIRED (read-only procedure in F.7) |
| Account pre-hijacking via unverified sign-up | FAIL (known, documented, low-to-medium) |
