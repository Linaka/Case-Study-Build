import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { toHtml } from "../src/lib/html.js";
import { parseEngineeringReportOutline } from "../src/lib/engineering-reports.js";
import { renderEngineeringOutlineReport, renderEngineeringReport } from "../src/templates/engineering-report.js";

const PROJECT = {
  title: "Sample technical delivery",
  subtitle: "A concise source case study for engineering reporting.",
  year: "2026",
  sector: "Product infrastructure",
  clientType: "Enterprise",
  role: "Engineering delivery",
  collaborators: ["Design", "Engineering"],
  context: "A team needed a clear technical narrative.",
  challenge: "The implementation had many tradeoffs to explain.",
  audience: "Engineering leadership and product stakeholders.",
  approach: "Use source project data to describe decisions, outputs and risks.",
  keyDecisions: [
    {
      title: "Standardise the source data",
      description: "Keep report generation deterministic."
    }
  ],
  outputs: [
    {
      title: "Engineering report",
      description: "A generated PDF preview."
    }
  ],
  impact: [
    {
      metric: "Generated artifacts",
      value: 1,
      unit: "report",
      description: "The source case study can now produce an engineering report."
    }
  ],
  reflection: "Follow-up work stays visible.",
  confidentialityNotes: "Keep confidential implementation details out of public exports.",
  assets: [
    {
      path: "/assets/uber/output-suite.svg",
      caption: "Report output suite.",
      visibility: "public",
      slot: "cover"
    }
  ]
};

test("engineering report preview renders source project as a PDF-ready report", () => {
  const markup = toHtml(renderEngineeringReport(PROJECT, { slug: "sample-technical-delivery" }));

  assert.match(markup, /<title>Sample technical delivery engineering report<\/title>/);
  assert.match(markup, />Engineering report</);
  assert.match(markup, /System and delivery context/);
  assert.match(markup, /Technical decisions and rationale/);
  assert.match(markup, /Signals, follow-up and risk controls/);
  assert.match(markup, /href="\/\?view=engineering-reports"/);
  assert.match(markup, /href="\/builder\/sample-technical-delivery"/);
  assert.match(markup, /href="\/api\/export\/engineering\/pdf\/sample-technical-delivery"/);
});

test("engineering outline parser creates section and subsection work packets", () => {
  const report = parseEngineeringReportOutline(`# Stage 2 Basis of Design

Intro copy.

## 1. Document Control

1.1 Report title
1.2 Project name and number

---

# Appendices

Appendix A — Stage 2 drawings
`, { slug: "stage-2-basis-of-design" });

  assert.equal(report.title, "Stage 2 Basis of Design");
  assert.equal(report.sectionCount, 2);
  assert.equal(report.subsectionCount, 2);
  assert.equal(report.sections[0].slug, "1-document-control");
  assert.equal(report.subsections[0].slug, "1-1-report-title");
  assert.equal(report.sections[1].number, "Appendix A");
  assert.equal(report.sections[1].title, "Stage 2 drawings");
  assert.equal(report.sections[1].slug, "appendix-a-stage-2-drawings");
});

test("engineering outline report exposes full, section and subsection exports", () => {
  const report = parseEngineeringReportOutline(`# Stage 2 Basis of Design

Intro copy.

## 1. Document Control

1.1 Report title
1.2 Project name and number

# Appendices

Appendix A — Stage 2 drawings
`, { slug: "stage-2-basis-of-design" });
  report.sections[0].images = [
    {
      path: "/assets/engineering-reports/stage-2-basis-of-design/section/1-document-control/control.png",
      caption: "Document control diagram",
      copyright: "Copyright Example Engineering"
    }
  ];
  report.subsections[0].images = [
    {
      path: "/assets/engineering-reports/stage-2-basis-of-design/subsection/1-1-report-title/title.png",
      caption: "Report title reference",
      copyright: "Copyright Example Engineering"
    }
  ];
  const fullMarkup = toHtml(renderEngineeringOutlineReport(report));
  const sectionMarkup = toHtml(renderEngineeringOutlineReport(report, { section: report.sections[0] }));
  const sectionEditMarkup = toHtml(renderEngineeringOutlineReport(report, { section: report.sections[0], mode: "edit" }));
  const subsectionMarkup = toHtml(renderEngineeringOutlineReport(report, { subsection: report.subsections[0] }));
  const subsectionEditMarkup = toHtml(renderEngineeringOutlineReport(report, { subsection: report.subsections[0], mode: "edit" }));

  assert.match(fullMarkup, /<title>Stage 2 Basis of Design compiled engineering report<\/title>/);
  assert.match(fullMarkup, /href="\/api\/export\/engineering\/compile\/stage-2-basis-of-design"/);
  assert.match(fullMarkup, /Report contents/);
  assert.match(fullMarkup, /<h2>Contents<\/h2>/);
  assert.match(fullMarkup, /Chapter contents/);
  assert.match(fullMarkup, /Chapter 01/);
  assert.match(fullMarkup, /Chapter 02/);
  assert.match(fullMarkup, /Appendix A\. Stage 2 drawings/);
  assert.doesNotMatch(fullMarkup, /Appendix A\. Appendix A:/);
  assert.match(fullMarkup, /Report title reference/);
  assert.doesNotMatch(fullMarkup, /Page images/);
  assert.match(fullMarkup, /2 subsections/);
  assert.doesNotMatch(fullMarkup, /<h3>Subsections(?: \(continued\))?<\/h3>/);
  assert.doesNotMatch(fullMarkup, /outline-subsection-list/);
  assert.match(sectionMarkup, /href="\/api\/export\/engineering\/section\/stage-2-basis-of-design\/1-document-control"/);
  assert.match(sectionMarkup, /Document control diagram/);
  assert.match(sectionMarkup, /Copyright Example Engineering/);
  assert.doesNotMatch(sectionMarkup, /Document Control images/);
  assert.doesNotMatch(sectionMarkup, /data-report-image-input/);
  assert.doesNotMatch(sectionMarkup, /<h3>Subsections(?: \(continued\))?<\/h3>/);
  assert.doesNotMatch(sectionMarkup, /outline-subsection-list/);
  assert.match(sectionEditMarkup, /data-section-editor/);
  assert.match(sectionEditMarkup, /data-report-image-input/);
  assert.match(sectionEditMarkup, /data-report-spreadsheet-input/);
  assert.match(sectionEditMarkup, /multiple/);
  assert.match(sectionEditMarkup, /data-section-format="heading" data-heading-level="3"/);
  assert.match(sectionEditMarkup, /data-section-format="heading" data-heading-level="4"/);
  assert.match(sectionEditMarkup, /data-section-format="heading" data-heading-level="5"/);
  assert.match(sectionEditMarkup, /data-section-format="bold"/);
  assert.match(sectionEditMarkup, /data-section-format="italic"/);
  assert.match(sectionEditMarkup, /Save section/);
  assert.match(sectionEditMarkup, /data-page-kind="section"/);
  assert.match(subsectionMarkup, /<title>1.1 Report title engineering report subsection<\/title>/);
  assert.match(subsectionMarkup, /href="\/api\/export\/engineering\/subsection\/stage-2-basis-of-design\/1-1-report-title"/);
  assert.match(subsectionMarkup, /href="\/engineering-report\/stage-2-basis-of-design\/subsections\/1-1-report-title\/edit"/);
  assert.match(subsectionMarkup, /Report title reference/);
  assert.doesNotMatch(subsectionMarkup, /Report title images/);
  assert.doesNotMatch(subsectionMarkup, /Subsection details/);
  assert.doesNotMatch(subsectionMarkup, /Parent section/);
  assert.doesNotMatch(subsectionMarkup, /Work package/);
  assert.doesNotMatch(subsectionMarkup, /data-subsection-editor/);
  assert.doesNotMatch(subsectionMarkup, /data-page-kind="subsection"/);
  assert.match(subsectionEditMarkup, /data-subsection-editor/);
  assert.match(subsectionEditMarkup, /data-subsection-format="heading" data-heading-level="3"/);
  assert.match(subsectionEditMarkup, /data-subsection-format="heading" data-heading-level="4"/);
  assert.match(subsectionEditMarkup, /data-subsection-format="heading" data-heading-level="5"/);
  assert.match(subsectionEditMarkup, /data-subsection-format="bold"/);
  assert.match(subsectionEditMarkup, /data-subsection-format="italic"/);
  assert.match(subsectionEditMarkup, /Save subsection/);
  assert.match(subsectionEditMarkup, /data-page-kind="subsection"/);
});

test("engineering outline sections continue long text at paragraph headings", () => {
  const heavyParagraph = "This paragraph captures the concept-stage engineering reasoning, coordination assumptions, decision record, risk movement and Stage 3 follow-up actions for the project team.";
  const body = Array.from({ length: 8 }, (_, index) => `Workstream ${index + 1}:

${heavyParagraph} ${heavyParagraph} ${heavyParagraph}`)
    .join("\n\n");
  const report = parseEngineeringReportOutline(`# Stage 2 Basis of Design

## 1. Long Design Narrative

${body}

1.1 Authoring packet
`, { slug: "stage-2-basis-of-design" });
  const markup = toHtml(renderEngineeringOutlineReport(report, { section: report.sections[0] }));
  const pageCount = (markup.match(/<section class="case-page/g) || []).length;

  assert.ok(pageCount > 1);
  assert.match(markup, /1\. Long Design Narrative \(continued\)/);
  assert.match(markup, /<p class="markdown-paragraph-heading">Workstream \d+:/);
});

test("engineering outline contents include sections, subsections and level-three headings", () => {
  const report = parseEngineeringReportOutline(`# Stage 2 Basis of Design

## 1. Document Control

1.1 Report title
1.2 Project name and number
`, { slug: "stage-2-basis-of-design" });

  report.sections[0].draft = {
    body: `### Section design note

#### Hidden section detail`,
    updatedAt: "2026-05-19T12:00:00.000Z"
  };
  report.subsections[0].draft = {
    body: `### Subsection focus

#### Hidden subsection detail`,
    status: "drafting",
    owner: "Engineering lead",
    updatedAt: "2026-05-19T12:00:00.000Z"
  };

  const markup = toHtml(renderEngineeringOutlineReport(report));
  const contentsMarkup = (markup.match(/<section class="case-page case-page--light case-page--contents">[\s\S]*?<\/section>/g) || []).join("\n");

  assert.match(contentsMarkup, /Chapter 01/);
  assert.match(contentsMarkup, /Document Control/);
  assert.match(contentsMarkup, /1\.1/);
  assert.match(contentsMarkup, /Report title/);
  assert.match(contentsMarkup, /1\.2/);
  assert.match(contentsMarkup, /Project name and number/);
  assert.match(contentsMarkup, /Section design note/);
  assert.match(contentsMarkup, /Subsection focus/);
  assert.doesNotMatch(contentsMarkup, /Hidden section detail/);
  assert.doesNotMatch(contentsMarkup, /Hidden subsection detail/);
});

test("engineering outline report paginates long main contents before appendices", () => {
  const projectSections = Array.from({ length: 7 }, (_, index) => `## ${index + 1}. Project Section ${index + 1}

${index + 1}.1 Work package
`).join("\n");
  const disciplineSections = Array.from({ length: 17 }, (_, index) => `## ${index + 8}. Discipline Section ${index + 8}

${index + 8}.1 Work package
`).join("\n");
  const appendices = Array.from({ length: 11 }, (_, index) => {
    const letter = String.fromCharCode(65 + index);

    return `Appendix ${letter} — Appendix ${letter} record`;
  }).join("\n");
  const report = parseEngineeringReportOutline(`# Stage 2 Basis of Design

${projectSections}
# Discipline Sections

${disciplineSections}
# Appendices

${appendices}

# Suggested Report Logic

Use a short narrative chapter.

# References

- Reference note
`, { slug: "stage-2-basis-of-design" });
  const markup = toHtml(renderEngineeringOutlineReport(report));
  const contentsPages = markup.match(/<section class="case-page case-page--light case-page--contents">[\s\S]*?<\/section>/g) || [];

  const contentsMarkup = contentsPages.join("\n");

  assert.ok(contentsPages.length >= 1);
  assert.match(contentsPages[0], /Chapter 01/);
  assert.match(contentsMarkup, /Discipline Sections/);
  assert.match(contentsMarkup, /Appendix A/);
  assert.match(contentsMarkup, /Suggested Report Logic/);
  assert.match(contentsMarkup, /References/);
});

test("engineering outline contents keep a readable two-column print layout", async () => {
  const theme = await fs.readFile(path.join(process.cwd(), "src/pdf/theme.css"), "utf8");
  const contentsColumnCounts = [...theme.matchAll(/\.report-contents--detailed\s*{[^}]*grid-template-columns:\s*repeat\((\d+)/g)]
    .map(match => Number(match[1]));

  assert.deepEqual(contentsColumnCounts, [2, 2]);
  assert.match(theme, /\.report-contents__entry p\s*{\s*font-size:\s*10pt;/);
  assert.match(theme, /\.report-contents__entry--level-1 p\s*{\s*font-size:\s*12pt;/);
});

test("engineering report images render as supporting figures without generated titles", () => {
  const report = parseEngineeringReportOutline(`# Stage 2 Basis of Design

## 1. Document Control

1.1 Report title
`, { slug: "stage-2-basis-of-design" });

  report.subsections[0].draft = {
    body: "Short written content that the figure can support.",
    status: "drafting",
    owner: "Engineering lead",
    updatedAt: "2026-05-19T12:00:00.000Z"
  };
  report.subsections[0].images = [
    {
      path: "/assets/engineering-reports/stage-2-basis-of-design/subsection/1-1-report-title/site-photo.png",
      caption: "site-photo.png",
      copyright: "Copyright Site Team"
    }
  ];

  const markup = toHtml(renderEngineeringOutlineReport(report, { subsection: report.subsections[0] }));

  assert.match(markup, /Short written content that the figure can support/);
  assert.match(markup, /report-image-gallery report-image-gallery--single/);
  assert.match(markup, /Copyright Site Team/);
  assert.doesNotMatch(markup, /Page images/);
  assert.doesNotMatch(markup, /Report title images/);
  assert.doesNotMatch(markup, /<figcaption>\s*<span>site-photo\.png<\/span>/);
});

test("engineering report image figures auto-fit without cropping", async () => {
  const theme = await fs.readFile(path.join(process.cwd(), "src/pdf/theme.css"), "utf8");

  assert.match(theme, /\.report-image-gallery--single/);
  assert.match(theme, /\.report-image-gallery--pair/);
  assert.match(theme, /\.report-image-gallery--trio/);
  assert.match(theme, /\.report-image-gallery--quad/);
  assert.match(theme, /object-fit:\s*contain;/);
});

test("engineering outline markdown renders heading levels one to five", () => {
  const report = parseEngineeringReportOutline(`# Stage 2 Basis of Design

## 1. Document Control

1.1 Report title
`, { slug: "stage-2-basis-of-design" });
  const subsection = report.subsections[0];

  subsection.draft = {
    body: `# Level one

## Level two

### Level three

#### Level four

##### Level five

Paragraph with **bold text** and *italic text*.`,
    status: "drafting",
    owner: "Engineering lead",
    updatedAt: "2026-05-19T12:00:00.000Z"
  };

  const markup = toHtml(renderEngineeringOutlineReport(report, { subsection }));

  assert.match(markup, /<h1 class="markdown-heading markdown-heading--level-1">Level one<\/h1>/);
  assert.match(markup, /<h2 class="markdown-heading markdown-heading--level-2">Level two<\/h2>/);
  assert.match(markup, /<h3 class="markdown-heading markdown-heading--level-3">Level three<\/h3>/);
  assert.match(markup, /<h4 class="markdown-heading markdown-heading--level-4">Level four<\/h4>/);
  assert.match(markup, /<h5 class="markdown-heading markdown-heading--level-5">Level five<\/h5>/);
  assert.match(markup, /<strong>bold text<\/strong>/);
  assert.match(markup, /<em>italic text<\/em>/);
});

test("engineering report image manifests keep multiple images per page", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "engineering-report-images-"));
  const reportsDir = path.join(root, "reports");
  const imagesDir = path.join(root, "images");
  const spreadsheetsDir = path.join(root, "spreadsheets");
  const draftDir = path.join(root, "drafts");
  const orderDir = path.join(root, "orders");
  const previousReportsDir = process.env.ENGINEERING_REPORTS_DIR;
  const previousImagesDir = process.env.ENGINEERING_REPORT_IMAGES_DIR;
  const previousSpreadsheetsDir = process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR;
  const previousDraftDir = process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR;
  const previousOrderDir = process.env.ENGINEERING_REPORT_ORDER_DIR;

  process.env.ENGINEERING_REPORTS_DIR = reportsDir;
  process.env.ENGINEERING_REPORT_IMAGES_DIR = imagesDir;
  process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR = spreadsheetsDir;
  process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = draftDir;
  process.env.ENGINEERING_REPORT_ORDER_DIR = orderDir;

  try {
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.writeFile(path.join(reportsDir, "stage-2-basis-of-design.md"), `# Stage 2 Basis of Design

## 1. Document Control

1.1 Report title
`);

    const module = await import(`../src/lib/engineering-reports.js?images=${Date.now()}`);

    await module.addEngineeringReportImage("stage-2-basis-of-design", "subsection", "1-1-report-title", {
      path: "/assets/engineering-reports/stage-2-basis-of-design/subsection/1-1-report-title/first.png",
      caption: "First page image",
      copyright: "Copyright First Studio"
    });
    await module.addEngineeringReportImage("stage-2-basis-of-design", "subsection", "1-1-report-title", {
      path: "/assets/engineering-reports/stage-2-basis-of-design/subsection/1-1-report-title/second.png",
      caption: "Second page image"
    });

    const report = await module.readEngineeringReport("stage-2-basis-of-design");

    assert.equal(report.subsections[0].images.length, 2);
    assert.equal(report.subsections[0].images[0].caption, "First page image");
    assert.equal(report.subsections[0].images[0].copyright, "Copyright First Studio");
    assert.equal(report.subsections[0].images[1].caption, "Second page image");
  } finally {
    if (previousReportsDir === undefined) {
      delete process.env.ENGINEERING_REPORTS_DIR;
    } else {
      process.env.ENGINEERING_REPORTS_DIR = previousReportsDir;
    }

    if (previousImagesDir === undefined) {
      delete process.env.ENGINEERING_REPORT_IMAGES_DIR;
    } else {
      process.env.ENGINEERING_REPORT_IMAGES_DIR = previousImagesDir;
    }

    if (previousSpreadsheetsDir === undefined) {
      delete process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR;
    } else {
      process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR = previousSpreadsheetsDir;
    }

    if (previousDraftDir === undefined) {
      delete process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR;
    } else {
      process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = previousDraftDir;
    }

    if (previousOrderDir === undefined) {
      delete process.env.ENGINEERING_REPORT_ORDER_DIR;
    } else {
      process.env.ENGINEERING_REPORT_ORDER_DIR = previousOrderDir;
    }

    await fs.rm(root, { recursive: true, force: true });
  }
});

test("engineering report order manifests reorder chapters and subsections", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "engineering-report-order-"));
  const reportsDir = path.join(root, "reports");
  const orderDir = path.join(root, "orders");
  const imagesDir = path.join(root, "images");
  const draftDir = path.join(root, "drafts");
  const spreadsheetsDir = path.join(root, "spreadsheets");
  const previousReportsDir = process.env.ENGINEERING_REPORTS_DIR;
  const previousOrderDir = process.env.ENGINEERING_REPORT_ORDER_DIR;
  const previousImagesDir = process.env.ENGINEERING_REPORT_IMAGES_DIR;
  const previousDraftDir = process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR;
  const previousSpreadsheetsDir = process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR;

  process.env.ENGINEERING_REPORTS_DIR = reportsDir;
  process.env.ENGINEERING_REPORT_ORDER_DIR = orderDir;
  process.env.ENGINEERING_REPORT_IMAGES_DIR = imagesDir;
  process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = draftDir;
  process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR = spreadsheetsDir;

  try {
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.writeFile(path.join(reportsDir, "stage-2-basis-of-design.md"), `# Stage 2 Basis of Design

## 1. First Section

1.1 Alpha
1.2 Beta

# Second Chapter

## 2. Second Section

2.1 Gamma
`);

    const module = await import(`../src/lib/engineering-reports.js?order=${Date.now()}`);

    await module.saveEngineeringReportOrder("stage-2-basis-of-design", {
      groupSlugs: ["second-chapter", "project-and-design-basis"],
      subsectionsBySectionSlug: {
        "1-first-section": ["1-2-beta", "1-1-alpha"]
      }
    });

    const report = await module.readEngineeringReport("stage-2-basis-of-design");

    assert.equal(report.groups[0].slug, "second-chapter");
    assert.equal(report.groups[1].slug, "project-and-design-basis");
    assert.deepEqual(report.sections.find(section => section.slug === "1-first-section").subsections.map(subsection => subsection.slug), [
      "1-2-beta",
      "1-1-alpha"
    ]);
    assert.deepEqual(report.subsections.map(subsection => subsection.slug), [
      "2-1-gamma",
      "1-2-beta",
      "1-1-alpha"
    ]);
  } finally {
    if (previousReportsDir === undefined) {
      delete process.env.ENGINEERING_REPORTS_DIR;
    } else {
      process.env.ENGINEERING_REPORTS_DIR = previousReportsDir;
    }

    if (previousOrderDir === undefined) {
      delete process.env.ENGINEERING_REPORT_ORDER_DIR;
    } else {
      process.env.ENGINEERING_REPORT_ORDER_DIR = previousOrderDir;
    }

    if (previousImagesDir === undefined) {
      delete process.env.ENGINEERING_REPORT_IMAGES_DIR;
    } else {
      process.env.ENGINEERING_REPORT_IMAGES_DIR = previousImagesDir;
    }

    if (previousDraftDir === undefined) {
      delete process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR;
    } else {
      process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = previousDraftDir;
    }

    if (previousSpreadsheetsDir === undefined) {
      delete process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR;
    } else {
      process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR = previousSpreadsheetsDir;
    }

    await fs.rm(root, { recursive: true, force: true });
  }
});

test("engineering report subsection drafts save independently and render in previews", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "engineering-report-subsections-"));
  const reportsDir = path.join(root, "reports");
  const draftDir = path.join(root, "drafts");
  const imagesDir = path.join(root, "images");
  const spreadsheetsDir = path.join(root, "spreadsheets");
  const orderDir = path.join(root, "orders");
  const previousReportsDir = process.env.ENGINEERING_REPORTS_DIR;
  const previousDraftDir = process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR;
  const previousImagesDir = process.env.ENGINEERING_REPORT_IMAGES_DIR;
  const previousSpreadsheetsDir = process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR;
  const previousOrderDir = process.env.ENGINEERING_REPORT_ORDER_DIR;

  process.env.ENGINEERING_REPORTS_DIR = reportsDir;
  process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = draftDir;
  process.env.ENGINEERING_REPORT_IMAGES_DIR = imagesDir;
  process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR = spreadsheetsDir;
  process.env.ENGINEERING_REPORT_ORDER_DIR = orderDir;

  try {
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.writeFile(path.join(reportsDir, "stage-2-basis-of-design.md"), `# Stage 2 Basis of Design

## 1. Document Control

1.1 Report title
1.2 Project name and number
`);

    const module = await import(`../src/lib/engineering-reports.js?drafts=${Date.now()}`);

    await module.saveEngineeringReportSubsectionDraft("stage-2-basis-of-design", "1-1-report-title", {
      owner: "Engineering lead",
      status: "drafting",
      body: `Design intent:

The report title should make the Stage 2 purpose clear to reviewers.`
    });

    const report = await module.readEngineeringReport("stage-2-basis-of-design");
    const subsection = report.subsections[0];
    const markup = toHtml(renderEngineeringOutlineReport(report, { subsection }));
    const editMarkup = toHtml(renderEngineeringOutlineReport(report, { subsection, mode: "edit" }));

    assert.equal(subsection.draft.owner, "Engineering lead");
    assert.equal(subsection.draft.status, "drafting");
    assert.match(markup, /Design intent:/);
    assert.doesNotMatch(markup, /data-subsection-editor/);
    assert.match(markup, /Edit subsection/);
    assert.match(editMarkup, /data-subsection-editor/);
    assert.match(editMarkup, /Save subsection/);
  } finally {
    if (previousReportsDir === undefined) {
      delete process.env.ENGINEERING_REPORTS_DIR;
    } else {
      process.env.ENGINEERING_REPORTS_DIR = previousReportsDir;
    }

    if (previousDraftDir === undefined) {
      delete process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR;
    } else {
      process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = previousDraftDir;
    }

    if (previousImagesDir === undefined) {
      delete process.env.ENGINEERING_REPORT_IMAGES_DIR;
    } else {
      process.env.ENGINEERING_REPORT_IMAGES_DIR = previousImagesDir;
    }

    if (previousSpreadsheetsDir === undefined) {
      delete process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR;
    } else {
      process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR = previousSpreadsheetsDir;
    }

    if (previousOrderDir === undefined) {
      delete process.env.ENGINEERING_REPORT_ORDER_DIR;
    } else {
      process.env.ENGINEERING_REPORT_ORDER_DIR = previousOrderDir;
    }

    await fs.rm(root, { recursive: true, force: true });
  }
});

test("engineering report sections save text and spreadsheet attachments for appendices", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "engineering-report-sections-"));
  const reportsDir = path.join(root, "reports");
  const draftDir = path.join(root, "drafts");
  const imagesDir = path.join(root, "images");
  const spreadsheetsDir = path.join(root, "spreadsheets");
  const orderDir = path.join(root, "orders");
  const previousReportsDir = process.env.ENGINEERING_REPORTS_DIR;
  const previousDraftDir = process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR;
  const previousImagesDir = process.env.ENGINEERING_REPORT_IMAGES_DIR;
  const previousSpreadsheetsDir = process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR;
  const previousOrderDir = process.env.ENGINEERING_REPORT_ORDER_DIR;

  process.env.ENGINEERING_REPORTS_DIR = reportsDir;
  process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = draftDir;
  process.env.ENGINEERING_REPORT_IMAGES_DIR = imagesDir;
  process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR = spreadsheetsDir;
  process.env.ENGINEERING_REPORT_ORDER_DIR = orderDir;

  try {
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.writeFile(path.join(reportsDir, "stage-2-basis-of-design.md"), `# Stage 2 Basis of Design

# Appendices

Appendix A — Stage 2 drawings
`);

    const module = await import(`../src/lib/engineering-reports.js?sections=${Date.now()}`);

    await module.saveEngineeringReportSectionDraft("stage-2-basis-of-design", "appendix-a-stage-2-drawings", {
      body: `### Appendix note

Appendix detail text for the drawings package.`
    });
    await module.addEngineeringReportSpreadsheet("stage-2-basis-of-design", "appendix-a-stage-2-drawings", {
      path: "/assets/engineering-reports/stage-2-basis-of-design/section/appendix-a-stage-2-drawings/spreadsheets/design-criteria.xlsx",
      caption: "Design criteria.xlsx",
      fileName: "design-criteria.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 1024
    });

    const report = await module.readEngineeringReport("stage-2-basis-of-design");
    const appendix = report.sections.find(section => section.slug === "appendix-a-stage-2-drawings");
    const fullMarkup = toHtml(renderEngineeringOutlineReport(report));
    const sectionMarkup = toHtml(renderEngineeringOutlineReport(report, { section: appendix }));
    const editMarkup = toHtml(renderEngineeringOutlineReport(report, { section: appendix, mode: "edit" }));

    assert.equal(appendix.number, "Appendix A");
    assert.equal(appendix.title, "Stage 2 drawings");
    assert.equal(appendix.draft.body.includes("Appendix detail text"), true);
    assert.equal(appendix.spreadsheets.length, 1);
    assert.match(fullMarkup, /Appendix A\. Stage 2 drawings/);
    assert.doesNotMatch(fullMarkup, /Appendix A\. Appendix A:/);
    assert.match(sectionMarkup, /Appendix detail text for the drawings package/);
    assert.match(sectionMarkup, /Design criteria\.xlsx/);
    assert.match(sectionMarkup, /Spreadsheet attachments/);
    assert.match(editMarkup, /data-section-editor/);
    assert.match(editMarkup, /data-report-image-input/);
    assert.match(editMarkup, /data-report-spreadsheet-input/);
  } finally {
    if (previousReportsDir === undefined) {
      delete process.env.ENGINEERING_REPORTS_DIR;
    } else {
      process.env.ENGINEERING_REPORTS_DIR = previousReportsDir;
    }

    if (previousDraftDir === undefined) {
      delete process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR;
    } else {
      process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = previousDraftDir;
    }

    if (previousImagesDir === undefined) {
      delete process.env.ENGINEERING_REPORT_IMAGES_DIR;
    } else {
      process.env.ENGINEERING_REPORT_IMAGES_DIR = previousImagesDir;
    }

    if (previousSpreadsheetsDir === undefined) {
      delete process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR;
    } else {
      process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR = previousSpreadsheetsDir;
    }

    if (previousOrderDir === undefined) {
      delete process.env.ENGINEERING_REPORT_ORDER_DIR;
    } else {
      process.env.ENGINEERING_REPORT_ORDER_DIR = previousOrderDir;
    }

    await fs.rm(root, { recursive: true, force: true });
  }
});
