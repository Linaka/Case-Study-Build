# Local-first case-study builder

A small local app for writing structured portfolio case studies and sales-facing business development documents as JSON, previewing them as HTML, and exporting designed A4 PDFs, editable Microsoft Word documents and marketing banner PNGs.

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
npm run export:xlsx
npm run export:pdf
npm run export:bd-pdf
npm run export:banner
npm run export:bd-banner
```

Case-study export scripts default to `uber-sample`. Business development export scripts default to `enterprise-build-support`. Pass another slug after `--`:

```bash
npm run export:md -- my-project
npm run export:xlsx -- my-project
npm run export:pdf -- my-project
npm run export:banner -- my-project
npm run export:bd-pdf -- my-bd-document
npm run export:bd-banner -- my-bd-document
```

Source JSON lives in `data/projects`. Generated files go to `exports`.
Case-study previews and builders also include an Excel data export for numeric impact metrics at `/api/export/xlsx/{slug}`.
Case-study and business development builders can import text-based PDF content into editable draft fields from the Import PDF control.
Case-study and business development builders can export `.docx` files with Save Word and import `.docx` content into editable draft fields with Import Word.
Case-study and business development previews/builders can export a `1600x900` marketing banner PNG from Save banner or Export marketing banner.

Business development document JSON lives in `data/bd-documents`. Export a BD PDF from the preview route with the Save PDF button or call `/api/export/bd/pdf/{slug}` while the local server is running.

## Checks

```bash
npm run check
npm test
npm run ci
npm run export:pdf
npm run export:bd-pdf
npm run export:banner
npm run export:bd-banner
npm run smoke:experience
npm run smoke:production
```

`npm run ci` runs syntax checks, unit tests, Markdown/Excel exports, case-study and BD PDF exports, case-study and BD banner exports, responsive experience smoke tests, and a production smoke test with hashed auth, `BACKUP_DIR`, and TLS proxy headers. GitHub Actions installs Chromium before running the same release check and uploads generated export artifacts.
