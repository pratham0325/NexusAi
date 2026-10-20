# Provider integrations

NexusAi calls AI providers from the Express backend. Provider credentials belong in `backend/.env` (or the deployment's secret manager), never in frontend variables prefixed with `VITE_`.

## OpenAI-compatible providers

Set `OPENAI_API_KEY` and, if needed, `OPENAI_BASE_URL`. The backend sends chat-completion requests to `<OPENAI_BASE_URL>/v1/chat/completions`. For the default OpenAI service, use `https://api.openai.com`.

## Google Gemini

Set `GOOGLE_AI_API_KEY`. The default `GOOGLE_AI_BASE_URL` is `https://generativelanguage.googleapis.com`; the backend uses its OpenAI-compatible chat-completions endpoint. Set `DEFAULT_AI_MODEL` to choose the server's default model.

## Groq

Create an API key in the Groq console and add it to the backend environment as `GROQ_API_KEY`. Groq's OpenAI-compatible endpoint defaults to `https://api.groq.com/openai`; the included GPT-OSS and Qwen models use `/v1/chat/completions`. Groq's free developer tier has rate limits and availability may change. Older saved Llama model IDs are routed to their documented GPT-OSS successors. Keys must stay on the backend, never in `VITE_` variables.

## Chat attachments

The chat composer accepts PDF, DOCX, TXT, Markdown and CSV documents (text is extracted in the browser), plus PNG, JPG and WebP images. Attachments are stored with the user's chat messages; image understanding requires a configured vision-capable model and provider key. Each message supports up to five files, with an 8 MB limit per document and a 7 MB limit per image.

## Vly gateway

If using the Vly-hosted gateway, set `VLY_INTEGRATION_KEY` and, optionally, `VLY_INTEGRATION_BASE_URL` (defaults to `https://integrations.freebuff.com`). The backend uses this gateway for non-demo model requests when the key is set; otherwise, it uses the configured Gemini/OpenAI-compatible provider. Keep the integration key secret and pass it to the backend only.

The Vly editor plugin, toolbar and screenshot listener are loaded only by the Vite dev server (`npm run dev`); production builds exclude them because they answer `postMessage` requests from any embedding page. Optional runtime error reporting is separately controlled by the public `VITE_VLY_APP_ID` and `VITE_VLY_MONITORING_URL` values. When enabled, it sends error/stack details and the page path to that endpoint, without query strings or fragments. Leave both unset to disable error reporting.

## Email

`RESEND_API_KEY` and `OTP_FROM_EMAIL` configure optional backend OTP email delivery. `ENABLE_DEV_OTP` is for local development only and must not be enabled in production. Normal password registration and sign-in do not require an email-provider key.

## Retrieval

Document retrieval currently uses the backend's cosine-similarity implementation. Atlas Vector Search and embeddings-provider integration are not implemented.
