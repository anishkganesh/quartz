# Quartz

Quartz is an AI learning application that turns a topic into an explorable article and lets readers follow linked concepts, simplify the explanation, ask questions, and generate audio or quizzes.

[Website](https://www.tryquartz.wiki) · [Demo video](https://www.youtube.com/watch?v=Btb3EwG8fQQ)

## Overview

The application combines a Next.js interface, server-side OpenAI calls, Supabase caching and authentication, and optional Stripe subscriptions. Generated content is educational assistance and should be checked against reliable sources when accuracy matters.

## Features

- Topic search with suggestions and streamed article generation.
- Linked concepts, multiple open article panels, navigation history, and browser article caching.
- Simplification at different explanation levels and contextual chat.
- Article narration and a two-host podcast script with generated audio.
- Cached quizzes and related questions.
- Voice transcription.

## Architecture

1. The browser opens `/page/[topic]` and checks its local article cache.
2. Next.js API routes handle generation, simplification, chat, audio, and supporting learning tools.
3. OpenAI produces text through the Responses API; audio features use text-to-speech and transcription endpoints.
4. The server can reuse Supabase records by normalized topic, model version, and feature-specific parameters. The server cache uses a 30-day freshness window.
5. Audio files are uploaded to Supabase Storage. Authentication, usage records, and Stripe routes support the existing access flow.

Visitors who are not signed in get three article generations per browser (`src/lib/client-usage.ts`). Signed-in free users get ten a day, recorded on the server, and active subscribers have no daily limit.

## Tech stack

| Layer | Implementation |
| --- | --- |
| Application | Next.js 14, React 18, TypeScript |
| Styling | Tailwind CSS |
| AI | OpenAI; model selection in the server configuration |
| Persistence and identity | Supabase Postgres, Auth, Storage |
| Billing | Stripe checkout and webhooks |
| Hosting | Next.js deployment; suitable for Vercel |

## Project structure

- `src/app/` — pages and API routes.
- `src/app/page/[topic]/` — article exploration interface.
- `src/lib/` — AI configuration, browser usage tracking, Supabase clients, caching, and audio helpers.
- `public/` — static assets.
- `package.json` — development, lint, build, and production scripts.

## Run locally

Prerequisites: Node.js and npm compatible with the committed dependencies, an OpenAI API key, and a configured Supabase project.

```bash
git clone https://github.com/anishkganesh/quartz.git
cd quartz
npm ci
```

Create `.env.local` in the project root:

```dotenv
OPENAI_API_KEY=your-openai-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
AI_MODEL=gpt-5.2
```

Keep the service-role and OpenAI keys server-side. If using another model, verify that it supports the API and options used in the generation routes.

```bash
npm run dev
```

Open `http://localhost:3000`. Production commands are `npm run build` followed by `npm start`.

## Configuration and data

The repository does not include a complete database migration/bootstrap. Provision the Supabase schema to match the queries and upserts in `src/lib/` and the API routes:

| Resource | Purpose |
| --- | --- |
| `quartz_articles` | Topic, article content, model version, creation time |
| `quartz_simplifications` | Topic and explanation level, content, model version |
| `quartz_audio` | Topic and simplification level, audio URL, model version |
| `quartz_podcasts` | Topic, script, audio URL, model version |
| `quartz_quiz_questions` | Topic and generated quiz questions |
| `quartz_related_questions` | Topic and follow-up questions |
| `quartz_usage` | Signed-in usage by user and date |
| `subscriptions` | Subscription state used by usage and Stripe handlers |
| `quartz-audio` storage bucket | Generated MP3 files exposed through public URLs |

Cache upserts require matching uniqueness constraints: article/podcast/quiz/related-question records use `(topic, model_version)`; simplifications also include `level`; narration also includes `simplification_level`. Match the full column definitions to the source before provisioning.

Google sign-in requires a Supabase OAuth provider and redirect URLs configured for the local and deployed origins. Billing additionally uses `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`; configure a webhook pointing to `/api/stripe/webhook`.

## Usage

Search for a topic, open the article, and follow linked concepts into related documents. Use the article tools to simplify, chat, narrate, create a podcast, or take a quiz.

Primary API routes include `/api/generate`, `/api/suggest`, `/api/simplify`, `/api/chat`, `/api/audify`, `/api/podcastify`, `/api/gamify`, `/api/related-questions`, and `/api/transcribe`.

## Validation

```bash
npm run lint
npm run build
```

No automated test suite is configured. Verify article streaming, linked navigation, cache reuse, each enabled learning tool, and the configured authentication/billing paths with real service credentials.

## Deployment

Deploy the Next.js project with the same environment variables and Supabase resources used locally. Configure production OAuth redirects and Stripe webhook URLs where those features are enabled. The live version runs at [tryquartz.wiki](https://www.tryquartz.wiki).

## Limitations

- AI responses and quizzes can contain errors.
- Fresh AI generations and audio incur provider costs.
- The database and storage setup is required separately; a clone alone is not a fully provisioned instance.
- Browser caching and anonymous limits are browser-local and can be cleared.

## Attribution and license

No license file is included.
