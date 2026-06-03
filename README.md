# Local-first case-study builder

A small local app for writing structured portfolio case studies and sales-facing business development documents as JSON, generating engineering reports from case-study source data, previewing them as HTML, and exporting designed A4 PDFs, editable Microsoft Word documents and marketing banner PNGs.

## Run

```bash
npm install
npm run setup:local
npm run dev
```

Open `http://localhost:3000`.

### Windows without admin rights

On Windows, use the portable launchers from the project folder:

```text
Install-Windows.cmd
Run-Windows.cmd
```

`Run-Windows.cmd` also performs the first-time setup if needed. It installs portable Node.js, npm dependencies and Playwright Chromium inside `.runtime` and `node_modules`, so it does not need admin rights or a machine-wide Node install. See `docs/windows-portable.md` for options and troubleshooting.

`npm run setup:local` installs the Playwright Chromium browser that PDF and banner exports need on each machine. If PDF or banner export fails after moving to another computer, run:

```bash
npm run preflight:render
npm run setup:local
```

The dashboard links to the main working views:

- Case studies: `/builder/{slug}` and `/projects/{slug}`
- Business development PDFs: `/bd-builder/{slug}` and `/bd/{slug}`
- Engineering report workspace: `/?view=engineering-reports` and `/engineering-report/stage-2-basis-of-design`
- Project-based engineering reports: `/engineering-reports/{slug}`

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
npm run export:engineering-pdf
npm run export:bd-pdf
npm run export:banner
npm run export:bd-banner
```

Case-study export scripts default to `uber-sample`. Engineering report exports default to `stage-2-basis-of-design`. Business development export scripts default to `enterprise-build-support`. Pass another slug after `--`:

```bash
npm run export:md -- my-project
npm run export:xlsx -- my-project
npm run export:pdf -- my-project
npm run export:engineering-pdf -- my-project
npm run export:banner -- my-project
npm run export:bd-pdf -- my-bd-document
npm run export:bd-banner -- my-bd-document
```

Source JSON lives in `data/projects`. Generated files go to `exports`.
Case-study previews and builders also include an Excel data export for numeric impact metrics at `/api/export/xlsx/{slug}`.
Engineering report outlines live in `data/engineering-reports`. The Stage 2 Basis of Design workspace can compile the full report at `/api/export/engineering/compile/{slug}`, preview/export each section at `/engineering-report/{slug}/sections/{sectionSlug}` and `/api/export/engineering/section/{slug}/{sectionSlug}`, and preview/export each subsection at `/engineering-report/{slug}/subsections/{subsectionSlug}` and `/api/export/engineering/subsection/{slug}/{subsectionSlug}`.
Section and subsection report pages can accept multiple SVG, PNG, JPG or WebP images from the Add images control. Uploaded page images are saved under `public/assets/engineering-reports` and tracked in `data/engineering-report-images`.
Case-study, business development and engineering report editors can request information from people by email, Teams chat or Teams channel. Requests are tracked at `/requests`, include a secure `/contribute/{token}` response form, and submitted responses are applied back to the target field, section or subsection. Microsoft sending uses delegated Graph sign-in with `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI` and `MICROSOFT_TOKEN_SECRET`; if those are not configured, the request is recorded with a delivery failure. The older engineering email-reply webhook at `/api/engineering-report-contribution-replies` remains available for existing contribution email flows.
Project-based engineering reports are still generated from existing case-study JSON and can be previewed at `/engineering-reports/{slug}` or exported as PDFs at `/api/export/engineering/pdf/{slug}`.
Case-study and business development builders can import text-based PDF content into editable draft fields from the Import PDF control.
Case-study and business development builders can export `.docx` files with Save Word and import `.docx` content into editable draft fields with Import Word.
Case-study and business development previews/builders can export a `1600x900` marketing banner PNG from Save banner or Export marketing banner.

Business development document JSON lives in `data/bd-documents`. Export a BD PDF from the preview route with the Save PDF button or call `/api/export/bd/pdf/{slug}` while the local server is running.

## Checks

```bash
npm run check
npm test
npm run ci
npm run preflight:render
npm run export:pdf
npm run export:engineering-pdf
npm run export:bd-pdf
npm run export:banner
npm run export:bd-banner
npm run smoke:exports
npm run smoke:quality
npm run smoke:experience
npm run smoke:production
```

`npm run ci` runs syntax checks, unit tests, Markdown/Excel exports, case-study, engineering-report and BD PDF exports, case-study and BD banner exports, artifact validation, responsive experience smoke tests, keyboard/accessibility/long-copy/visual snapshot quality smoke tests, and a production smoke test with hashed auth, `BACKUP_DIR`, and TLS proxy headers. GitHub Actions installs Chromium before running the same release check and uploads generated export artifacts.
