# Local-first case-study builder

A small local app for writing structured portfolio case studies and sales-facing business development documents as JSON, previewing them as HTML, and exporting designed A4 PDFs.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The dashboard links to both content types:

- Case studies: `/builder/{slug}` and `/projects/{slug}`
- Business development PDFs: `/bd-builder/{slug}` and `/bd/{slug}`

For a shared/internal deployment, protect the app with Basic Auth:

```bash
APP_USER=admin APP_PASSWORD=change-me npm run dev
```

For production, use hashed users, role-based access, backups and a TLS reverse proxy. See `docs/production.md`.

## Export

```bash
npm run export:md
npm run export:pdf
npm run export:bd-pdf
```

Both scripts default to `uber-sample`. Pass another slug after `--`:

```bash
npm run export:md -- my-project
npm run export:pdf -- my-project
```

Source JSON lives in `data/projects`. Generated files go to `exports`.

Business development document JSON lives in `data/bd-documents`. Export a BD PDF from the preview route with the Save PDF button or call `/api/export/bd/pdf/{slug}` while the local server is running.

## Checks

```bash
npm run check
npm test
npm run ci
npm run export:pdf
npm run export:bd-pdf
```

`npm run ci` runs syntax checks, unit tests, the Markdown export, the sample case-study PDF export, and the BD PDF export. GitHub Actions installs Chromium before running the same release check.
