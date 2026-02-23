# Inflio -- Developer Setup Guide

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Supabase** -- PostgreSQL database + file storage
- **Clerk** -- Authentication
- **Inngest** -- Background job processing
- **OpenAI** (GPT-5.2) -- Content generation, analysis, blog posts, social posts
- **AssemblyAI** -- Video transcription
- **FAL.ai** -- Image generation (Flux models, persona LoRA training)
- **Cloudinary** -- Video processing (subtitle burning, logo overlay)
- **Klap** -- Short clip generation from long-form video

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # Lint
npm start            # Production server
```

## Environment Variables

### Required (app won't start without these)

| Variable | Service | Where to get it |
|----------|---------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Project Settings > API |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | Dashboard > API Keys |
| `CLERK_SECRET_KEY` | Clerk | Dashboard > API Keys |
| `NEXT_PUBLIC_APP_URL` | Self | Your app URL (e.g. `http://localhost:3000`) |

### AI Services

| Variable | Service | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | OpenAI | Content analysis, posts, blogs, chapters |
| `ASSEMBLYAI_API_KEY` | AssemblyAI | Video transcription |
| `FAL_KEY` | FAL.ai | Image generation, persona training |
| `CLOUDINARY_URL` | Cloudinary | Subtitle burning, video processing |
| `KLAP_API_KEY` | Klap | Short clip generation |

### Social OAuth (for publishing to platforms)

| Variable | Platform |
|----------|----------|
| `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` | X/Twitter |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Facebook/Instagram |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | YouTube |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok |

### Infrastructure

| Variable | Purpose |
|----------|---------|
| `UPSTASH_REDIS_REST_URL` | Background job queue |
| `UPSTASH_REDIS_REST_TOKEN` | Background job queue |
| `INTERNAL_API_KEY` | Server-to-server auth for workers |
| `WORKER_SECRET` | Cron/worker endpoint auth |
| `SENTRY_DSN` | Error monitoring (optional) |
| `STRIPE_SECRET_KEY` | Billing (test mode) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks |

## Inngest (Background Jobs)

Persona portraits, post generation, clip processing, and thumbnail batches run via Inngest.

**Local dev:** Inngest dev server runs automatically with `npm run dev`.

**Production (Vercel):**
1. Install the [Inngest Vercel integration](https://app.inngest.com/settings/integrations/vercel/connect)
2. Keys are auto-set on deploy
3. Manual sync after deploy: `curl -X PUT https://your-domain.com/api/inngest`

## Supabase Storage Buckets

Run `migrations/fix-storage-rls-policies.sql` in the Supabase SQL editor to create:
- `videos` -- Raw uploads and processed video
- `ai-generated-images` -- Thumbnails and graphics
- `thumbnails` -- Public thumbnails
- `subtitles` -- Subtitle files
- `persona-training` -- Persona training photos
- `persona-lora` -- Trained LoRA model files

## Database Migrations

Apply migrations from `/migrations/` in order in the Supabase SQL editor.

## Service Account Setup (for founders)

| Service | Sign up | What you need |
|---------|---------|---------------|
| OpenAI | platform.openai.com | API key |
| AssemblyAI | assemblyai.com | API key |
| Klap | klap.app | API key |
| FAL.ai | fal.ai | API key |
| Cloudinary | cloudinary.com | `CLOUDINARY_URL` from dashboard |
| Stripe | dashboard.stripe.com | Test mode keys |
| Supabase | supabase.com | Project URL + keys |
| Clerk | clerk.com | Publishable + secret keys |
| Upstash | console.upstash.com | Redis REST URL + token |
