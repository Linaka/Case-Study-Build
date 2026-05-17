# Local-first case-study builder

A small local app for writing structured portfolio case studies as JSON, previewing them as HTML, and exporting Markdown and designed A4 PDFs.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Export

```bash
npm run export:md
npm run export:pdf
```

Both scripts default to `uber-sample`. Pass another slug after `--`:

```bash
npm run export:md -- my-project
npm run export:pdf -- my-project
```

Source JSON lives in `data/projects`. Generated files go to `exports`.
