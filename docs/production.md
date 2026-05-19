# Production readiness

This app is designed first as a local-first portfolio and business development document builder. It is suitable for local production use and small internal deployments when the production controls below are configured.

## Hardened

- Project JSON is normalized and validated before save.
- Builder fields expose character limits that match server-side validation.
- Saves use an `If-Match` content revision so stale browser tabs cannot silently overwrite newer file changes.
- Uploaded images are limited to SVG, PNG, JPG and WebP under 5 MB.
- Uploads are checked by file signature, not only by extension.
- SVG uploads reject active content such as scripts, event handlers, `foreignObject` and `javascript:` URLs.
- Basic security headers are set on app, API and asset responses.
- Production requires hashed user accounts from `AUTH_USERS_FILE` or `AUTH_USERS`.
- User roles are enforced: `viewer` can read/export, `editor` can save/upload, `admin` has full access.
- Production requires HTTPS at the edge via `TRUST_PROXY=1` and `X-Forwarded-Proto: https`.
- Production requires `BACKUP_DIR`; JSON saves, uploads and PDF exports are copied into timestamped backups.
- PDF and banner exports are serialized through a queue and rendered by separate worker processes.
- Tests cover auth, backup behavior, project validation, BD validation, save conflicts, image upload validation, report page image attachments, Word export/import, PDF import, Excel export, dashboard IA, section-based engineering report generation, marketing banner templates, export artifact dimensions, keyboard paths, semantic labels, long-copy export stress and visual snapshot generation.
- GitHub Actions runs install, checks, tests, Markdown/Excel exports, case-study, engineering-report and BD PDF exports, case-study and BD banner exports, artifact validation, responsive experience smoke tests, quality smoke tests and a production smoke test.

## Local Production

Use:

```bash
npm ci
npm run setup:local
APP_USER=admin APP_PASSWORD=change-me npm run dev
```

Keep `HOST=127.0.0.1` for personal local use. Use a reverse proxy with TLS if exposing it to a network.

## Production Deployment

Generate hashed users:

```bash
npm run user:create -- admin "replace-with-a-long-password" admin
npm run user:create -- editor "replace-with-a-long-password" editor
npm run user:create -- viewer "replace-with-a-long-password" viewer
```

Place those entries in a private JSON file based on `config/users.example.json`, then run behind a TLS reverse proxy:

```bash
NODE_ENV=production \
HOST=127.0.0.1 \
PORT=3000 \
TRUST_PROXY=1 \
AUTH_USERS_FILE=/secure/path/users.json \
BACKUP_DIR=/secure/path/case-study-backups \
npm run dev
```

The reverse proxy must terminate TLS and forward:

```text
X-Forwarded-Proto: https
Host: your-domain.example
```

Set `REQUIRE_HTTPS=0` only for isolated local production smoke tests.

Validate the production controls locally with:

```bash
npm run smoke:production
```

This starts the server with `NODE_ENV=production`, a temporary hashed user store, `BACKUP_DIR`, `TRUST_PROXY=1`, and verifies HTTPS proxy enforcement through `X-Forwarded-Proto: https`.

Validate the render environment on each machine with:

```bash
npm run preflight:render
```

This launches Playwright Chromium once and catches missing browser binaries or host dependencies before a PDF or banner export is requested.

Validate the main design and navigation surfaces with:

```bash
npm run smoke:experience
```

This checks the dashboard tabs, builders, previews, section/subsection engineering report pages and marketing banner pages at desktop and mobile widths, including export-link presence and horizontal overflow.

Validate the polished experience gates with:

```bash
npm run smoke:exports
npm run smoke:quality
```

These assert generated export file types and `1600x900` banner dimensions, exercise keyboard paths for dashboard tabs, import/export menus, accordions and save flows, check semantic labels, stress max-length PDF/banner/Word exports, and save visual snapshots for PDF covers, BD proof sections and banners under `exports/visual-snapshots`.

## Storage and Restore

Live JSON remains in `data/projects`, `data/bd-documents` and `data/engineering-report-images`. Uploaded project assets remain in `public/assets/projects`; uploaded report page images remain in `public/assets/engineering-reports`. With `BACKUP_DIR` configured, each save/upload/export creates a timestamped copy under the same relative path, for example:

```text
BACKUP_DIR/2026-05-18T19-00-00-000Z/data/bd-documents/enterprise-build-support.json
BACKUP_DIR/2026-05-18T19-00-00-000Z/public/assets/projects/example/image.png
```

Restore by copying the desired backup file back into the matching live path.

## Remaining Hosted-Service Gaps

- No database-backed audit trail.
- No multi-user merge UI for conflicting edits.
- PDF and banner exports intentionally remain queued and process-isolated on the same host for this deployment model.
- Uploaded assets intentionally remain on local disk with `BACKUP_DIR` snapshots for this deployment model.
