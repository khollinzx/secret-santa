# Secret Santa

A participant app and a separate admin app, with a NestJS API and Supabase PostgreSQL persistence. Participants choose numbered cards; each card has a fixed, hidden recipient. A matching algorithm blocks choices that violate exclusions or strand another participant.

## What works

- Participant signup/sign-in, separate administrator sign-in with password and TOTP MFA, opaque 12-hour sessions, suspension checks, rate limits, and role checks.
- Exchange creation, date/budget rules, invitations by reusable group link or email-bound link, membership, per-event wishlists, and gift-ready status.
- Registration closure, secure shuffled pools, mutual/directional exclusions, transactional selection, repeat-request idempotency, private reveal, reminder requests, deadline extension, reset, cancellation, and completion.
- Admin dashboard, event progress, user suspension/restoration, notification status/retries, and audit history. Hidden mappings are never exposed through admin endpoints.
- Durable PostgreSQL notification outbox and SMTP worker, with retries/backoff and crash recovery. SQL-backed jobs keep this first version deployable without Redis.
- Responsive participant and admin interfaces, keyboard-accessible selection and confirmation dialogs, and explicit browser-preview mode.

## Preview versus real application

The hosted preview is a **static interactive demonstration**. It has no live PostgreSQL connection. Sample people and hidden mappings are stored in browser localStorage and can be inspected; they are not suitable for real secret exchanges. The profile menu switches sample participants and resets the sample workspace. No email is sent in preview mode.

When `NEXT_PUBLIC_API_URL` is configured at build time, the same frontend uses the authenticated API instead of sample data. Production hidden mappings remain in PostgreSQL and are never included in pool responses. Login sessions are stored in sessionStorage, independently for participant and administrator audiences.

## Project layout

```
apps/web/       Participant Next.js application (plus /admin/login and gated /admin preview entries)
apps/admin/     Independently built Next.js admin application
apps/api/       NestJS API, administrator bootstrap, and SMTP worker
packages/domain/ Shared matching and number-eligibility logic
database/       Versioned initial PostgreSQL schema
scripts/        Build and preview helpers
tests/          Matching tests and opt-in PostgreSQL API integration test
```

## Run the real application with Docker

Requirements: Node.js 22+ if building locally; Docker Engine and Compose for the stack.

1. Copy `.env.example` to `.env` and replace POSTGRES_PASSWORD with unique, random URL-safe alphanumeric values.
2. Set `WEB_ORIGIN`, `ADMIN_ORIGIN`, and `NEXT_PUBLIC_API_URL` to your intended browser-facing addresses. Defaults are `http://localhost:3000`, `http://localhost:3001`, and `http://localhost:4000`.
3. Start the stack:

```bash
docker compose up -d --build
```

The API startup runs the checksummed migration inside a transaction and an advisory lock. It creates the private `secret_santa` schema without changing other application schemas. Later starts skip the already-applied migration. Never delete a volume to apply migrations. Wait for the API health check before bootstrapping an administrator.

Local entries:

- Participant app: http://localhost:3000
- Admin app: http://localhost:3001
- API: http://localhost:4000

The Compose ports bind to loopback. For an internet deployment, put HTTPS reverse proxies in front of these ports and set matching HTTPS origins before building the frontends. CORS accepts only the configured participant/admin origins.

### Create your administrator

Generate a 32-character base32 TOTP secret and enroll it in an authenticator using a standard `otpauth://totp/SecretSanta:ADMIN_EMAIL?secret=SECRET&issuer=SecretSanta` setup URI. Keep the secret private. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), and `ADMIN_TOTP_SECRET` in `.env`.

```bash
docker compose --profile bootstrap run --rm admin-bootstrap
```

The bootstrap service reads the three administrator values from `.env`. Run it once per administrator email. Never put real passwords or TOTP secrets in command arguments or commit them.

Sign in through the admin app using the administrator email, password, and current 6-digit authenticator code. Participant accounts cannot access administrator endpoints, and participant-audience sessions are refused even for staff accounts.

### Enable real email delivery

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` in `.env`, then run:

```bash
docker compose --profile email up -d worker
```

Invitations and reminders are persisted atomically with their originating actions. The worker claims jobs using `FOR UPDATE SKIP LOCKED`, retries failures up to five times with exponential backoff, and recovers abandoned claims. Delivery is at least once, so an SMTP timeout can cause a duplicate email; a stable Message-ID helps mail systems deduplicate it. Emails link to the application and never include recipient assignments.

## Local development without Docker

Provision PostgreSQL 17+ and set `DATABASE_URL` in `.env`. For Supabase use the session-pooler connection string from your project’s Connect panel (port 5432), including your URL-encoded database password. Hosted connections require verified TLS; set `DATABASE_SSL_CA` if the project requires its downloaded CA certificate. The application retains its existing participant sessions and administrator TOTP authentication. Supabase is the database provider; Supabase Auth and browser Data API access are not enabled.

```bash
npm ci
npm run build:api
node --env-file=.env scripts/migrate-postgres.mjs
node --env-file=.env apps/api/dist/main.js
```

In separate terminals:

```bash
node --env-file=.env scripts/dev.mjs
node --env-file=.env node_modules/next/dist/bin/next dev apps/admin -p 3001
```

Local administrator bootstrap:

```bash
node --env-file=.env apps/api/dist/seed-admin.js
```

Local worker:

```bash
node --env-file=.env apps/api/dist/worker.js
```

Next.js only automatically reads environment files in its own app directory. The Node env-file commands above explicitly load the root `.env`. Public API/origin variables are embedded in frontend builds; changing them requires rebuilding.

## Checks

```bash
npm test
npm run build:api
npm run build:admin
npm run build
```

The regular test command runs the pure matching checks and skips database integration unless `TEST_DATABASE_URL` is explicitly set. The matching tests exhaust all allowed selection paths for a five-person exchange, verify exclusions, protect the final participant, prevent repeat picks, and check a 100-person pool.

To run the API integration test, create a dedicated disposable PostgreSQL database whose name ends in `_test`, grant a test user access, and set `TEST_DATABASE_URL` to it. Build the API first. Then:

```bash
node --env-file=.env --test tests/api.integration.test.mjs
```

The test creates the schema if absent, registers temporary test accounts, exercises joining and access checks, races two picks for the same number, verifies idempotency and reset privacy, and completes an exchange. It removes its own created records afterward. Do not point it at production.

## Core API

All endpoints except registration/login require `Authorization: Bearer <opaque-session-token>`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /auth/register | Register participant |
| POST | /auth/login | Sign in; admin audience also requires TOTP code |
| POST | /auth/logout | Revoke current session |
| GET | /me | Current account |
| GET, POST | /events | List own exchanges or create one |
| GET | /events/:id | Own event, progress, and own recipient only |
| POST | /events/:id/invitations | Create group or email invitation |
| POST | /invitations/accept | Join using invitation token |
| PATCH | /events/:id/wishlist | Update own preferences |
| PATCH | /events/:id/gift | Update own gift-ready status |
| POST, DELETE | /events/:id/exclusions | Add exclusions or clear rules before picking |
| POST | /events/:id/status | close, reopen, open_picking, reset, complete, cancel |
| PATCH | /events/:id/deadline | Extend picking deadline |
| GET | /events/:id/pool | Number/status pairs; no hidden recipient IDs |
| POST | /events/:id/pick | Atomically claim an eligible number |
| POST | /events/:id/reminders | Queue pending-picker reminders; once per 24 hours |
| GET | /admin/overview | Admin metrics, events, users, deliveries, audit |
| PATCH | /admin/users/:id | Super-admin suspension/restoration |
| POST | /admin/notifications/:id/retry | Retry failed delivery |

## Draw invariants

- At least three and at most 100 confirmed participants per exchange.
- Each member is represented exactly once in a fixed, securely shuffled numbered pool.
- The eligibility checker uses bipartite matching to ensure every remaining giver can still receive an eligible, distinct recipient.
- Every pick locks the event row, re-reads current selections, revalidates the choice, and commits one selection. Unique database constraints enforce both one pick per giver and one claim per number per round.
- Repeated pick requests return the already-saved number.
- Registration and exclusions lock once picking starts. A reset requires acknowledgment, preserves historical records, invalidates the active round, clears gift readiness, and notifies members.
- Admin views report picking progress without returning hidden mappings or other people's recipients. The organiser can still view their own recipient when participating.

## Current limits and follow-up work

This is an initial MVP, not a fully operated production service. Hosted database connectivity and live SMTP delivery require the credentials described above. No real email was sent during implementation.

Email-address verification, password recovery, organiser removal of participants before picking, anonymous messaging, automatic identity reveal, staff-role management UI, configurable platform defaults, formal audit export, and pagination beyond the current bounded admin lists are not implemented. Platform defaults are configuration values; there is no placeholder settings screen.

The draw is secret by application access controls, not end-to-end encryption against database administrators. Recipient-specific disabled cards and nearly completed pools can allow participants to infer some relationships; this follows from the fixed numbered-pool design. Matching feasibility is guaranteed; the sequential picking process does not claim uniform probability across every possible final matching.

Dates are event calendar dates; backend deadlines currently end at UTC midnight after that date. Configure an explicit event timezone before offering timezone-specific deadlines internationally. All sample data is fictional preview content.

Before using with real groups, run the PostgreSQL integration suite in your deployment environment, configure HTTPS and backups, verify email delivery, and provision your administrator account.

Official framework references:
- https://nextjs.org/docs/app/guides/static-exports
- https://docs.nestjs.com/techniques/validation

## Administrator entry

The participant app has no admin navigation link. Open `/admin/login/` directly to sign in. Visiting `/admin/` without a separate administrator session redirects there. The independent admin app exposes the same `/admin/login/` route on its own origin. Production sign-in verifies password, TOTP, role, and session audience through the API. The hosted sample preview disables credential fields and offers an explicitly labelled sample-data entry; it is not real authentication. Admin preview sign-out clears that separate preview session.

## Render and Supabase

See [deploy/RENDER.md](deploy/RENDER.md) for the existing Render API service, two static frontends, and Supabase project `twydcpdjkwxgwapqsedm`. The Blueprint does not provision a Render database or persistent disk. The private schema enables row level security and revokes access from Supabase anonymous/authenticated Data API roles. Only the backend PostgreSQL connection accesses assignments, passwords, and sessions.
