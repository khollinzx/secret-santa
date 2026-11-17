# Deploy Secret Santa to Render

The root `render.yaml` configures the existing `secret-santa` service as the API and provisions two independently built static sites, a NestJS API, and a private MySQL 8.4 service with a persistent disk. It never substitutes PostgreSQL or deploys browser sample data as the production backend.

## Planned resources

| Resource | Runtime | Compute/storage |
| --- | --- | --- |
| secret-santa-web | Static Next.js export | No compute plan |
| secret-santa-admin | Separate static Next.js export | No compute plan |
| secret-santa | Node.js 22 / NestJS | Free initially; may sleep when idle |
| secret-santa-mysql | Private Docker / MySQL 8.4 | Paid 1 CPU / 2 GB RAM; 3 GB persistent disk |

The MySQL service incurs ongoing compute and storage charges. Review the current Render estimate before applying the plan. Upgrade the API to paid compute if you need uninterrupted availability. All networking resources must use the same workspace and region. Oregon matches the confirmed existing API service.

## Source and approval

1. Push this source to the intended GitHub repository and grant Render access to it. Use a private repository unless you choose to publish the application source.
2. Confirm the Render workspace and the project/environment identified by the supplied dashboard link.
3. Validate `render.yaml` using Render's current CLI/API and schema, then create and inspect the Blueprint plan. The file should be on the remote branch before planning.
4. Review all new resources and charges. Apply only after authorizing the reviewed plan. Adopt only the existing secret-santa service; do not modify unrelated services.
5. Ensure the new resources are assigned to the intended existing project/environment. Top-level Blueprint entries do not identify the project by ID; the operator must verify assignment in the dashboard.

Generated database secrets remain in Render. The API receives the MySQL password by service reference and uses separate connection fields, so generated base64 characters do not break a URL. The frontends obtain actual Render hostnames through references and convert them into HTTPS origins at build time. No service URL is guessed from a desired name.

## First launch

The database Dockerfile copies the initial schema to `/docker-entrypoint-initdb.d`, which MySQL applies only when initializing an empty data directory. The API retries database readiness during startup and provides `GET /health` for Render health checks. User-created accounts start as participants; administrative endpoints continue to require an admin-audience session, staff role, password, and TOTP.

The participant app is served at the participant site's root URL. The administrator app has its own root URL, with sign-in at `/admin/login/`. There is no admin link in the participant sidebar.

## Administrator bootstrap

After the API and MySQL are live, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), and `ADMIN_TOTP_SECRET` (32 base32 characters) securely on the API service. Enroll the TOTP secret in an authenticator. Then run this command in the API service shell:

```bash
node apps/api/dist/seed-admin.js
```

This creates one administrator and fails rather than overwriting an existing email. Never store the bootstrap password or TOTP secret in Git or chat. Once the administrator is created, remove those bootstrap environment variables through Render's Environment page. Confirm `/health` returns 200 before testing sign-in, invitations, and picking with real accounts.

## Email worker

SMTP credentials have not been supplied. Invitations can generate shareable links, while email messages remain in the MySQL outbox until a worker is configured. To enable delivery, add a background worker using the same source/region, `npm ci --include=dev && npm run build:api`, and `node apps/api/dist/worker.js`. Configure the same DB_* variables plus SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and MAIL_FROM securely. The worker needs paid compute; review its additional cost before creating it.

## Verification and operations

- Run `npm test`, `npm run build:api`, and both frontend builds before pushing.
- Run the opt-in API integration test against a disposable MySQL database before live use.
- Monitor each Render deployment to a terminal `live` state; creation/approval alone is not deployment success.
- Test signup, invitation acceptance, exclusions, concurrent picks, recipient privacy, reset, and separate admin login after deployment.
- Keep the MySQL service private. Back up with mysqldump or a MySQL-aware backup tool; a disk snapshot alone is not a database backup strategy.
- Disable automatic Blueprint sync during first setup. Explicitly enable it later only if future infrastructure pushes should apply automatically.

References: https://render.com/docs/blueprint-spec.md, https://render.com/docs/deploy-mysql.md, https://render.com/docs/private-network.md
