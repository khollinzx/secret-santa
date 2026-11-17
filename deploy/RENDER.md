# Render with Supabase PostgreSQL

The root `render.yaml` adopts the existing `secret-santa` API in Collins Benson’s Workspace and creates separate participant and administrator static sites. Persistent data lives in Supabase project `twydcpdjkwxgwapqsedm`. No Render database or disk is provisioned.

| Resource | Configuration |
| --- | --- |
| secret-santa | Existing Node API, free instance, Oregon, `/health` readiness check |
| secret-santa-web | Participant static site |
| secret-santa-admin | Separate administrator static site |
| Supabase | External PostgreSQL; existing project and its billing plan |

Free Render API instances can sleep. Review Render’s actual plan before applying it. This configuration does not create an email worker; SMTP delivery needs a separately configured worker and any associated compute charges.

## Database connection

1. Open https://supabase.com/dashboard/project/twydcpdjkwxgwapqsedm and choose **Connect**.
2. Copy the PostgreSQL **Session pooler** URI (port 5432). Use its actual hostname and username; do not guess the region. Supply your database password, URL-encoded where necessary. A Supabase publishable/anonymous API key is not a PostgreSQL password.
3. Set this URI as `DATABASE_URL` on the API service’s Render **Environment** page. Keep it out of Git, browser variables, screenshots, and chat. If Supabase requires its downloadable CA certificate, also set `DATABASE_SSL_CA` to that certificate’s PEM content. Hosted TLS verifies certificates.
4. Use the session pooler rather than the transaction pooler: startup migrations use a session advisory lock, and this persistent API uses a small connection pool.

The backend retains its own password/session authentication and administrator password authentication. No Supabase browser keys or Supabase Auth configuration are required.

## Review and deploy

Push the source and `render.yaml` to `khollinzx/secret-santa` on `master`, then plan the existing Blueprint. Review the proposed API update and two static sites before approving. A plan never applies changes by itself. Where the Blueprint requests `DATABASE_URL`, either supply it through the secure Render flow, or approve in Render’s Dashboard and then set it on the API Environment page; an initial API deployment can fail until the value is present.

The API build is `npm ci --include=dev && npm run build:api`. Startup is:

```sh
node scripts/migrate-postgres.mjs && node apps/api/dist/main.js
```

The migration creates only the application’s `secret_santa` schema and tables, records a SHA-256 checksum, and runs atomically under an advisory lock. Repeated starts skip the applied migration. Changing an already-applied migration is rejected; future schema changes need a new versioned migration. Row level security is enabled and schema/table access is revoked for anonymous and authenticated Supabase Data API roles. Do not add this schema to the exposed Data API schemas. The backend must connect with the owning PostgreSQL role.

Frontend build scripts obtain actual Render hostnames through service references and use HTTPS origins. Public URL changes require a frontend rebuild. `/health` queries PostgreSQL so a healthy process also confirms database connectivity.

## Create the administrator

After the API and database are healthy, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters) securely on the API service. Run in the API service shell:

```sh
node apps/api/dist/seed-admin.js
```

The bootstrap fails rather than overwriting an existing email. Remove the bootstrap environment variables afterward. If your Render service tier has no interactive shell, run the same compiled bootstrap locally using a secure `.env` with the Supabase session-pooler connection. Sign in at the administrator static site’s `/admin/login/` route with email and password.

## Email and operations

Invitations generate shareable links. Delivery records remain in PostgreSQL until a worker is configured. A worker uses the same repository, API build command, `DATABASE_URL`, and optional `DATABASE_SSL_CA`; start with `node apps/api/dist/worker.js`. Supply `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` securely. Review any additional worker cost before provisioning it.

Before live use, configure backups appropriate to the Supabase plan, create the administrator, verify sign-in and invitations, race duplicate-number requests in a test exchange, and confirm only the signed-in participant sees their recipient. Local database tests must use a disposable database ending in `_test`; never run destructive tests against production.

References:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://node-postgres.com/features/ssl
- https://render.com/docs/blueprint-spec
