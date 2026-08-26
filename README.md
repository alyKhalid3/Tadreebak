# Tadreebak API

Backend for **Tadreebak** — an internship platform that connects students with companies. Companies create internships (backed by purchased credits), students apply with their CV, company owners review, accept, and complete applications, and both sides rate each other after completion.

## Tech Stack

| Layer      | Technology |
|------------|------------|
| Runtime    | Node.js 20+ (ESM) |
| Language   | TypeScript (strict, `exactOptionalPropertyTypes`) |
| Framework  | Express 5 |
| Database   | MongoDB + Mongoose 9 |
| Validation | Zod 4 |
| Auth       | JWT (access + refresh) + OTP-by-email (signup, email change, password reset) + Google OAuth |
| Security   | Helmet, CORS whitelist, express-rate-limit, bcrypt |
| Files      | Multer (disk) → Cloudinary (raw/images) |
| Email      | Nodemailer (SMTP) |
| Payments   | Paymob (checkout + HMAC-verified webhook) |
| Cache      | Upstash Redis (REST) with in-memory fallback |
| Monitoring | Sentry (instrumented first in `src/index.ts`) |
| Docs       | swagger-jsdoc + swagger-ui-express at `/api/v1/docs` |

## Project Structure

```
src/
├── index.ts                  # Entry — loads Sentry first, then bootstrap
├── bootstrap.ts              # App setup: CORS, helmet, rate limit, DB, routes, swagger, error handling, graceful shutdown
├── routes.ts                 # Mounts all module routers + file-proxy
├── instrument.ts             # Sentry initialization
├── DB/
│   ├── models/               # Mongoose schemas (User, Company, InternShip, Application, Notification, Rating, PaymentOrder)
│   ├── types/                # Interfaces + enums (roles, categories, question types, …)
│   ├── repos/                # Thin data-access layer per entity
│   ├── DBRepo.ts             # Generic base repository
│   └── db.connection.ts      # Mongo connection
├── modules/
│   ├── auth/                 # Signup/login/Google/refresh/logout + OTP flows
│   ├── user/                 # Profile, uploads (picture, cover, resume, course certificates), own applications
│   ├── company/              # Company CRUD, media, admin approve/ban/unban/pending
│   ├── internModule/         # Internships + applications + ratings
│   ├── billingModule/        # Plans, credits, Paymob checkout/webhooks
│   └── notificationModule/   # In-app notifications + unread count
├── middleware/               # auth, Authorization (roles), validation, rate limiters
├── utils/
│   ├── error.ts              # ApplicationError, NotFoundException, …
│   ├── multer/               # Upload pipeline, Cloudinary service + signed file proxy
│   ├── sendEmail/            # Nodemailer + HTML templates + event emitter
│   ├── notifications/        # notification bus (EventEmitter subscribers)
│   ├── paymob/               # Paymob API client + HMAC verification
│   ├── cache/                # Redis REST client + cacheWrap/cacheDel/cacheFlushPrefix
│   └── …                     # hash, JWT, OTP, successHandler, feature flags, logger, companyVirtuals
└── config/
    ├── swagger.ts            # OpenAPI spec (generated at startup)
    └── .env                  # Environment variables (git-ignored)
```

## Getting Started

Requirements: Node.js 20+, MongoDB (local or Atlas).

```bash
# 1. Install dependencies
npm install

# 2. Create the environment file
cp src/config/.env.example src/config/.env   # adjust if no example exists: create it from the table below

# 3. Run in development (tsx watch — hot reload)
npm run dev
```

The server starts on `PORT` (default 3000). It refuses to start when MongoDB isn't reachable.

### Type checking & tests

```bash
npx tsc --noEmit                         # type check
npx tsx --test "src/**/*.test.ts"        # run unit tests (node:test)
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string |
| `PORT` | no | HTTP port (default 3000) |
| `ACCESS_TOKEN_SECRET` | yes | JWT signing secret for access tokens (≥32 chars) |
| `REFRESH_TOKEN_SECRET` | yes | JWT signing secret for refresh tokens (≥32 chars) |
| `BEARER` | no | Legacy token constant checked by the auth middleware |
| `SALT_ROUNDS` | no | bcrypt cost (default 10) |
| `CLOUD_NAME`, `API_KEY`, `API_SECRET`, `APP_NAME` | yes | Cloudinary credentials (+ folder prefix) |
| `HOST`, `EMAIL_PORT`, `EMAIL`, `PASSWORD` | yes | SMTP settings for Nodemailer |
| `FRONTEND_URL`, `APP_URL` | no | Used to build links in match/notification emails |
| `GOOGLE_CLIENT_ID` | no | Google OAuth login |
| `PAYMOB_HMAC_SECRET`, `PAYMOB_REDIRECTION_URL` | yes* | Paymob webhook HMAC + redirect URL (\*required if billing is used) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | no | Redis cache (falls back to in-memory) |
| `CACHE_ENABLED` | no | `"false"` disables the cache entirely |
| `RATE_LIMIT_ENABLED` | no | Set `"true"` to enforce rate limiting |
| `BILLING_ENABLED` | no | Feature flag; anything but `"false"` enables billing |
| `NODE_ENV` | no | `"production"` hides stack traces + Swagger |
| `ALLOW_SWAGGER_IN_PROD` | no | `"true"` exposes `/api/v1/docs` in production |
| `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ENVIRONMENT`, `SENTRY_DEBUG`, `SENTRY_RELEASE` | no | Sentry monitoring |
| `LOG_LEVEL` | no | `"debug"` enables verbose logging |

## API Overview

Base URL: `/api/v1`

- **Docs**: `GET /api/v1/docs` (hidden in production unless `ALLOW_SWAGGER_IN_PROD=true`)
- **Health**: `GET /health` — liveness + Redis status
- **File proxy**: `GET /file-proxy/:filename?url=<cloudinary url>` (auth) — serves CVs and legal attachments inline with the right `Content-Type`, restricted to the configured Cloudinary cloud, 10 MB cap

### Auth — `/auth`

`POST /signup`, `POST /login`, `POST /google`, `POST /refresh`, `POST /logout`, `PATCH /change-password`, `PATCH /change-email`, `PATCH /confirm-change-email`, `PATCH /forgot-password`, `PATCH /reset-password`, `POST /confirm-email`, `POST /resend-otp`

Signup and sensitive flows are OTP-by-email; OTPs expire in 5 minutes and lock out after 5 failed attempts. All auth endpoints share a per-IP limiter (10 requests / 15 min).

### User — `/user`

- `GET /:userId` — public profile (experience is derived from completed internships)
- `GET /:userId/applications` — the user's own applications
- `POST /upload/profilePicture`, `/upload/coverPicture`, `/upload/resume`, `/upload/course-certificate/:courseIndex`
- `POST /courses` — add a course (+optional certificate); `PATCH /courses/:courseIndex` — rename and/or replace its certificate (404 if the course doesn't exist)

### Company — `/company`

- `GET /`, `GET /:companyId`, `GET /name/:name` — public listings (legal attachment + company email excluded)
- `POST /` — create (multipart, includes `legalAttachment` PDF, `location` as JSON string `{"lat":…,"lng":…}`)
- `PATCH /:companyId` — owner updates (banned/unapproved companies are not editable)
- `POST /:companyId/logo`, `/coverPicture`
- Admin (role `ADMIN`): `GET /admin/pending` (returns `legalAttachmentUrl` — a file-proxy URL for reviewing the PDF), `PATCH /admin/:companyId/approve` | `/ban` | `/unban`

Companies expose a `googleMapsUrl` virtual whenever `location { lat, lng }` is set.

### Internships — `/internships` and `/company/:companyId/internships`

- `GET /internships` (filters: type, location, companyId, title, closed, pagination), `GET /internships/:internId`
- `POST /internships/:internId/save` | `DELETE /internships/:internId/save` (student) — bookmark / unbookmark (idempotent)
- `GET /internships/saved` (student) — the student's bookmarked internships, paginated, newest first
- `POST /company/:companyId/internships` — company owner (consumes 1 credit)
- `PATCH` / `DELETE /company/:companyId/internships/:internId` — company owner
- `PATCH /company/:companyId/internships/:internId/close` | `/reopen` — company owner; closed internships leave the default listing and stop accepting applications
- Creating an internship notifies (email + in-app) students whose interest `categories` match its required `track`, or whose education matches `requiredEducation`

### Applications

- `POST /company/:companyId/internships/:internId/applications` — student (multipart CV optional; QA answers required when the internship has questions)
- `GET …/applications` — company owner
- `PATCH /…/applications/:applicationId` — accept/reject (company owner)
- `DELETE /…/applications/:applicationId` — student withdraws (pending only)
- `POST /…/applications/:applicationId/send-acceptance-email`
- `POST /…/applications/:applicationId/complete` — starts the post-completion rating window

### Ratings — `/application` router

- `POST /application/:applicationId/rate` — both sides, score 1–5 + comment; revealed only after both rate or 14 days
- `GET /application/:applicationId/ratings`

### Billing — `/company/:companyId/billing` (+ `/webhooks/paymob`)

- `GET /plans`, `GET /credits`
- Paymob checkout with server-side confirmation; the webhook is HMAC-verified (`POST /webhooks/paymob`) and idempotent (compare-and-swap on the `pending` status guarantees at-most-once credit, applied atomically with `$inc`)

### Notifications — `/notifications`

`GET /` and `GET /unread-count`. Events: application submitted/reviewed/cancelled, company approved/banned/unbanned, rating received, internship match.

## Roles

| Role | Capabilities |
|---|---|
| `STUDENT` | Browse internships, apply, withdraw, rate, own profile |
| `COMPANY_OWNER` | Own companies, post/manage internships (credits), review applications, buy credits |
| `ADMIN` | Approve/ban/unban companies, review pending legal attachments |

## Key Design Points

- **Credits are money**: every internship post decrements a company's `internshipCredits`; Paymob payments grant credits only after HMAC verification plus an idempotent status flip (`pending → paid`, compare-and-swap) with an atomic `$inc`.
- **Validation-first routing**: every endpoint is Zod-validated through `validation.middleware`; bodies are rehydrated into `req.body` before reaching services.
- **Notifications & emails via EventEmitter**: services publish; `notificationBus.ts` and `emailEvents.ts` subscribe and persist/send asynchronously, so a failing subscriber never breaks the request.
- **Lean reads + cache**: list/detail reads go through `cacheWrap` (Upstash Redis with in-memory fallback); Mongoose 9 lean virtuals are re-applied via `applyCompanyVirtuals` so caches still carry `googleMapsUrl`.
- **Graceful shutdown**: SIGTERM/SIGINT close the HTTP server, disconnect Mongoose and Redis, then exit.
- **Uploads are proxied**: Cloudinary raw URLs are not served directly to browsers; `file-proxy` streams them with correct `Content-Type` and an `inline` disposition (CVs, legal attachments).

## Deployment

The API is currently deployed on Belmo (`https://tadreebak-e285.onbelmo.uk`), frontend on Vercel (`https://tadrebk.vercel.app`).

**Important**: Swagger (and any code) only updates after the server process **restarts** — the spec is generated at startup and cached. After deploying files, trigger a restart/redeploy on the host.

## Notes

- `npm run deploy` in `package.json` references `src/deploy.ts`, which does not exist yet.
- Swagger UI is intentionally hidden in production (`NODE_ENV=production`) unless `ALLOW_SWAGGER_IN_PROD=true`.