import { html, safeJson } from "../lib/html.js";
import { PROJECT_CLIENT_FIELD_LIMITS, PROJECT_FIELD_LIMITS } from "../lib/limits.js";
import {
  field as builderField,
  formCard,
  imageLoader,
  imagePlacement as builderImagePlacement,
  itemField as builderItemField,
  itemNumberField as builderItemNumberField,
  itemTextarea as builderItemTextarea,
  structuredList,
  text,
  textarea as builderTextarea,
  visibilitySelect as builderVisibilitySelect
} from "./components/builder-controls.js";
import { renderDocument } from "./layout.js";

function renderProjectCard(project) {
  return html`<article class="project-card">
    <div>
      <p class="eyebrow">${project.year || "Draft"} · ${project.sector || "Uncategorised"}</p>
      <h2>${project.title}</h2>
      <p>${project.subtitle}</p>
    </div>
    <nav class="button-row" aria-label="${project.title} actions">
      <a class="button button--subtle" href="/builder/${project.slug}">Edit</a>
      <a class="button button--subtle" href="/projects/${project.slug}">Preview</a>
      <a class="button button--subtle" href="/api/export/word/${project.slug}" download>Word</a>
      <a class="button button--primary" href="/api/projects/${project.slug}" download>JSON</a>
    </nav>
  </article>`;
}

function renderBdDocumentCard(document) {
  return html`<article class="project-card">
    <div>
      <p class="eyebrow">${document.year || "Draft"} · ${document.audience || "Business development"}</p>
      <h2>${document.title}</h2>
      <p>${document.subtitle}</p>
    </div>
    <nav class="button-row" aria-label="${document.title} actions">
      <a class="button button--subtle" href="/bd-builder/${document.slug}">Edit</a>
      <a class="button button--subtle" href="/bd/${document.slug}">Preview</a>
      <a class="button button--subtle" href="/api/export/bd/word/${document.slug}" download>Word</a>
      <a class="button button--primary" href="/api/bd-documents/${document.slug}" download>JSON</a>
    </nav>
  </article>`;
}

function renderEngineeringReportCard(project) {
  return html`<article class="project-card">
    <div>
      <p class="eyebrow">${project.year || "Draft"} · ${project.sector || "Engineering source"}</p>
      <h2>${project.title}</h2>
      <p>${project.subtitle}</p>
    </div>
    <nav class="button-row" aria-label="${project.title} engineering report actions">
      <a class="button button--subtle" href="/builder/${project.slug}">Edit source</a>
      <a class="button button--subtle" href="/engineering-reports/${project.slug}">Preview report</a>
      <a class="button button--primary" href="/api/export/engineering/pdf/${project.slug}" download>Generate PDF</a>
    </nav>
  </article>`;
}

function reportOutlinePath(report, part, slug = "") {
  const suffix = slug ? `/${slug}` : "";

  return `/engineering-report/${report.slug}${part ? `/${part}` : ""}${suffix}`;
}

function reportOutlineExportPath(report, part, slug = "") {
  const suffix = slug ? `/${slug}` : "";

  return `/api/export/engineering/${part}/${report.slug}${suffix}`;
}

function reportSubsectionEditPath(report, subsection) {
  return `${reportOutlinePath(report, "subsections", subsection.slug)}/edit`;
}

function reportSectionTitle(section) {
  const title = text(section?.title).trim();
  const number = text(section?.number).trim();

  if (number && title.toLowerCase().startsWith(number.toLowerCase())) {
    return title.slice(number.length).replace(/^[:.\s-]+/, "").trim() || title;
  }

  return title;
}

function reportSectionLabel(section) {
  const title = reportSectionTitle(section);

  return section.number ? `${section.number}. ${title}` : title;
}

function field(label, name, value, type = "text", maxLength = PROJECT_FIELD_LIMITS[name]) {
  return builderField({ label, name, value, type, maxLength });
}

function textarea(label, name, value, rows = 5, maxLength = PROJECT_FIELD_LIMITS[name]) {
  return builderTextarea({ label, name, value, rows, maxLength });
}

function itemField(label, fieldName, value, maxLength = PROJECT_FIELD_LIMITS.titleListTitle, requestable = true) {
  return builderItemField({ label, fieldName, value, maxLength, requestable });
}

function itemNumberField(label, fieldName, value) {
  return builderItemNumberField({ label, fieldName, value });
}

function itemTextarea(label, fieldName, value, maxLength = PROJECT_FIELD_LIMITS.titleListDescription, requestable = true) {
  return builderItemTextarea({ label, fieldName, value, maxLength, requestable });
}

function visibilitySelect(value) {
  return builderVisibilitySelect({ value, fallback: "public" });
}

function assetForSlot(assets, slot, fallbackIndex) {
  return assets.find(asset => text(asset?.slot) === slot) || assets[fallbackIndex] || {};
}

function imagePlacement({ title, description, slot, item }) {
  return builderImagePlacement({
    title,
    description,
    slot,
    item,
    limits: PROJECT_FIELD_LIMITS,
    fallbackVisibility: "public"
  });
}

function actionMenu(slug) {
  return html`<details class="action-menu">
    <summary class="button button--primary">Import / Export</summary>
    <div class="action-menu__panel">
      <section class="action-menu__group" aria-labelledby="project-import-actions">
        <h2 id="project-import-actions">Import</h2>
        <label class="action-menu__item file-button">
          Import PDF
          <input type="file" data-pdf-import-input accept="application/pdf,.pdf">
        </label>
        <label class="action-menu__item file-button">
          Import Word
          <input type="file" data-word-import-input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
        </label>
        <p class="action-menu__meta" data-pdf-import-meta>No PDF imported yet.</p>
        <p class="action-menu__meta" data-word-import-meta>No Word document imported yet.</p>
      </section>
      <section class="action-menu__group" aria-labelledby="project-export-actions">
        <h2 id="project-export-actions">Export</h2>
        <a class="action-menu__item" href="/api/export/xlsx/${slug}" data-xlsx-link="true" download>Export Excel data</a>
        <a class="action-menu__item" href="/api/export/word/${slug}" data-word-link="true" download>Export Word</a>
        <a class="action-menu__item" href="/api/export/pdf/${slug}" data-pdf-link="true" download>Export PDF</a>
        <a class="action-menu__item" href="/api/export/banner/${slug}" data-banner-link="true" download>Export marketing banner</a>
        <a class="action-menu__item" href="/api/projects/${slug}" download data-json-link="true">Export JSON</a>
      </section>
    </div>
  </details>`;
}

function renderTitleDescriptionItem(item, index, titleLabel = "Title") {
  return html`<article class="list-item" data-list-item>
    <header class="list-item__header">
      <h4>Item ${index + 1}</h4>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove item">Remove</button>
    </header>
    <div class="field-grid field-grid--item">
      ${itemField(titleLabel, titleLabel === "Metric" ? "metric" : "title", item?.[titleLabel === "Metric" ? "metric" : "title"], titleLabel === "Metric" ? PROJECT_FIELD_LIMITS.impactMetric : PROJECT_FIELD_LIMITS.titleListTitle)}
      ${itemTextarea("Description", "description", item?.description)}
    </div>
  </article>`;
}

function renderImpactItem(item, index) {
  return html`<article class="list-item" data-list-item>
    <header class="list-item__header">
      <h4>Item ${index + 1}</h4>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove item">Remove</button>
    </header>
    <div class="field-grid field-grid--item">
      ${itemField("Metric", "metric", item?.metric, PROJECT_FIELD_LIMITS.impactMetric)}
      ${itemNumberField("Value", "value", item?.value)}
      ${itemField("Unit", "unit", item?.unit, PROJECT_FIELD_LIMITS.impactUnit)}
      ${itemTextarea("Description", "description", item?.description)}
    </div>
  </article>`;
}

function renderAssetItem(item, index) {
  const imagePath = text(item?.path);

  return html`<article class="list-item" data-list-item>
    <header class="list-item__header">
      <h4>Asset ${index + 1}</h4>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove asset">Remove</button>
    </header>
    ${imageLoader(imagePath)}
    <div class="field-grid field-grid--item">
      ${itemField("Image path", "path", item?.path, PROJECT_FIELD_LIMITS.assetPath, false)}
      ${visibilitySelect(item?.visibility)}
      ${itemTextarea("Caption", "caption", item?.caption, PROJECT_FIELD_LIMITS.assetCaption, false)}
    </div>
  </article>`;
}

function dashboardTab({ activeView, count, href, label, value }) {
  const isActive = activeView === value;

  return html`<a class="dashboard-tab${isActive ? " dashboard-tab--active" : ""}" href="${href}" aria-current="${isActive ? "page" : "false"}">
    <span>${label}</span>
    <span class="dashboard-tab__count">${count}</span>
  </a>`;
}

function landingChoiceCard(choice) {
  return html`<a class="landing-choice-card" href="${choice.href}">
    <span class="landing-choice-card__kicker">${choice.kicker}</span>
    <span class="landing-choice-card__visual" aria-hidden="true">
      <img src="${choice.asset}" alt="">
    </span>
    <span class="landing-choice-card__copy">
      <span class="landing-choice-card__title">${choice.title}</span>
      <span class="landing-choice-card__description">${choice.description}</span>
    </span>
    <span class="landing-choice-card__meta">
      ${choice.tags.map(tag => html`<span>${tag}</span>`)}
    </span>
    <span class="landing-choice-card__cta">${choice.cta}</span>
  </a>`;
}

function renderLandingChoices(engineeringReport) {
  const choices = [
    {
      kicker: "Client proof",
      title: "Case study",
      description: "Shape a proof story with context, decisions, outputs and impact.",
      href: "/builder/new-case-study",
      cta: "New case study",
      asset: "/assets/uber/route-frame.svg",
      tags: ["Evidence", "Portfolio"]
    },
    {
      kicker: "Commercial",
      title: "Business development document",
      description: "Package the offer, buyer problems, proof points and next steps.",
      href: "/bd-builder/new-business-development-document?template=business-development-document",
      cta: "New BD document",
      asset: "/assets/uber/output-suite.svg",
      tags: ["Sales", "Proposal"]
    },
    {
      kicker: "Technical",
      title: "Engineering report",
      description: "Start a technical source draft for assumptions, design basis and evidence.",
      href: "/builder/new-engineering-report?template=engineering-report",
      cta: "New engineering report",
      asset: "/assets/uber/decision-grid.svg",
      tags: ["Basis", "Review"]
    },
    {
      kicker: "Operations",
      title: "Monthly report",
      description: "Capture the month in progress, decisions, risks and priorities.",
      href: "/builder/new-monthly-report?template=monthly-report",
      cta: "New monthly report",
      asset: "/assets/uber/output-suite.svg",
      tags: ["Status", "Cadence"]
    }
  ];

  return html`<section class="landing-section" aria-labelledby="landing-create-heading">
    <div class="landing-section__header">
      <div>
        <p class="eyebrow">Create</p>
        <h2 id="landing-create-heading">Choose a document type</h2>
      </div>
    </div>
    <div class="landing-choice-grid">
      ${choices.map(landingChoiceCard)}
    </div>
  </section>`;
}

function fileTimestamp(value) {
  const timestamp = Date.parse(value || "");

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatUpdatedAt(value) {
  const timestamp = fileTimestamp(value);

  if (!timestamp) {
    return "Saved file";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

function recentFileDate(file) {
  if (!file.updatedAt) {
    return html`<span>Saved file</span>`;
  }

  return html`<time datetime="${file.updatedAt}">${formatUpdatedAt(file.updatedAt)}</time>`;
}

function recentFiles(projects, bdDocuments, engineeringReport) {
  return [
    ...projects.map(project => ({
      type: "Case study",
      title: project.title || project.slug,
      subtitle: project.subtitle || project.sector || "Case-study draft",
      href: `/builder/${project.slug}`,
      updatedAt: project.updatedAt
    })),
    ...bdDocuments.map(document => ({
      type: "Business development",
      title: document.title || document.slug,
      subtitle: document.subtitle || document.audience || "Business development draft",
      href: `/bd-builder/${document.slug}`,
      updatedAt: document.updatedAt
    })),
    ...(engineeringReport ? [{
      type: "Engineering report",
      title: engineeringReport.title,
      subtitle: `${engineeringReport.sectionCount} sections and ${engineeringReport.subsectionCount} subsections`,
      href: `/engineering-report/${engineeringReport.slug}`,
      updatedAt: engineeringReport.updatedAt
    }] : [])
  ]
    .sort((left, right) => fileTimestamp(right.updatedAt) - fileTimestamp(left.updatedAt))
    .slice(0, 6);
}

function recentFileRow(file) {
  return html`<a class="recent-file-row" href="${file.href}">
    <span class="recent-file-row__copy">
      <span class="recent-file-row__type">${file.type}</span>
      <span class="recent-file-row__title">${file.title}</span>
      <span class="recent-file-row__subtitle">${file.subtitle}</span>
    </span>
    <span class="recent-file-row__meta">
      ${recentFileDate(file)}
      <span>Open</span>
    </span>
  </a>`;
}

function renderRecentFiles(projects, bdDocuments, engineeringReport) {
  const files = recentFiles(projects, bdDocuments, engineeringReport);

  return html`<section class="landing-section" aria-labelledby="landing-recent-heading">
    <div class="landing-section__header">
      <div>
        <p class="eyebrow">Resume</p>
        <h2 id="landing-recent-heading">Recent saved files</h2>
      </div>
      <a class="button button--subtle" href="/?view=case-studies">Browse files</a>
    </div>
    <div class="recent-file-list">
      ${files.length
        ? files.map(recentFileRow)
        : html`<p class="empty-state">No saved files yet.</p>`}
    </div>
  </section>`;
}

function importButton(kind, format, label, accept) {
  return html`<label class="button button--subtle file-button">
    ${label}
    <input type="file" data-dashboard-import data-import-kind="${kind}" data-import-format="${format}" accept="${accept}">
  </label>`;
}

function importPanel({ title, description, kind }) {
  return html`<article class="landing-import-panel">
    <div>
      <h3>${title}</h3>
      <p>${description}</p>
    </div>
    <div class="button-row">
      ${importButton(kind, "pdf", "Import PDF", "application/pdf,.pdf")}
      ${importButton(kind, "word", "Import Word", ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    </div>
  </article>`;
}

function renderLandingImport() {
  return html`<section class="landing-section" aria-labelledby="landing-import-heading">
    <div class="landing-section__header">
      <div>
        <p class="eyebrow">Import</p>
        <h2 id="landing-import-heading">Import new files</h2>
      </div>
    </div>
    <div class="landing-import-grid">
      ${importPanel({
        title: "Case-study source",
        description: "Bring in a PDF or Word proof story and save it as an editable draft.",
        kind: "project"
      })}
      ${importPanel({
        title: "Business development source",
        description: "Turn proposal or offer source material into a business development draft.",
        kind: "bd"
      })}
    </div>
    <p class="landing-import-status" data-dashboard-import-status role="status" aria-live="polite">Ready to import PDF or Word sources.</p>
  </section>`;
}

function renderLandingDashboard(projects, bdDocuments, engineeringReport) {
  return html`<main class="app-shell app-shell--landing">
    <header class="app-header landing-header">
      <div>
        <p class="eyebrow">Portfolio system</p>
        <h1>Start the right document</h1>
        <p class="landing-header__copy">Create a focused draft, return to recent work, or convert source files into structured documents.</p>
      </div>
    </header>
    ${renderLandingChoices(engineeringReport)}
    <div class="landing-workspace-grid">
      ${renderRecentFiles(projects, bdDocuments, engineeringReport)}
      ${renderLandingImport()}
    </div>
  </main>`;
}

function renderCaseStudyDashboard(projects) {
  return html`<section class="dashboard-section" id="case-studies" aria-labelledby="case-studies-heading">
    <div class="dashboard-section__header">
      <div class="dashboard-section__title">
        <p class="eyebrow">Proof library</p>
        <h2 id="case-studies-heading">Case studies</h2>
      </div>
      <a class="button button--primary" href="/builder/new-case-study">New case study</a>
    </div>
    <div class="project-list">
      ${projects.length
        ? projects.map(renderProjectCard)
        : html`<p class="empty-state">No case studies yet.</p>`}
    </div>
  </section>`;
}

function renderBdDashboard(bdDocuments) {
  return html`<section class="dashboard-section" id="bd-documents" aria-labelledby="bd-documents-heading">
    <div class="dashboard-section__header">
      <div class="dashboard-section__title">
        <p class="eyebrow">Sales documents</p>
        <h2 id="bd-documents-heading">Business development PDFs</h2>
      </div>
      <a class="button button--primary" href="/bd-builder/new-business-development-document?template=business-development-document">New BD document</a>
    </div>
    <div class="project-list">
      ${bdDocuments.length
        ? bdDocuments.map(renderBdDocumentCard)
        : html`<p class="empty-state">No business development documents yet.</p>`}
    </div>
  </section>`;
}

function reportStat(label, value) {
  return html`<div class="report-stat">
    <strong>${value}</strong>
    <span>${label}</span>
  </div>`;
}

function renderReportSubsectionRow(report, subsection) {
  return html`<li class="report-subsection-row" data-report-order-item="subsection" data-subsection-slug="${subsection.slug}">
    <button class="report-drag-handle" type="button" draggable="true" data-reorder-handle aria-label="Drag subsection ${subsection.number} ${subsection.title}">
      <span aria-hidden="true"></span>
    </button>
    <div class="report-subsection-row__copy">
      <span>${subsection.number}</span>
      <p>${subsection.title}</p>
    </div>
    <nav aria-label="${subsection.number} ${subsection.title} actions">
      <a class="report-subsection-row__edit" href="${reportSubsectionEditPath(report, subsection)}" aria-label="Edit subsection ${subsection.number} ${subsection.title}">Edit</a>
      <a href="${reportOutlinePath(report, "subsections", subsection.slug)}" aria-label="Preview subsection ${subsection.number} ${subsection.title}">Preview</a>
      <a href="${reportOutlineExportPath(report, "subsection", subsection.slug)}" aria-label="Export subsection ${subsection.number} ${subsection.title} as PDF" download>PDF</a>
    </nav>
  </li>`;
}

function renderReportSectionCard(report, section) {
  return html`<article class="report-section-card" id="${section.slug}">
    <header class="report-section-card__header">
      <div>
        <p class="eyebrow">${section.groupTitle}</p>
        <h3>${reportSectionLabel(section)}</h3>
      </div>
      <nav aria-label="${reportSectionLabel(section)} section actions">
        <a class="button button--subtle" href="${reportOutlinePath(report, "sections", section.slug)}/edit">Edit</a>
        <a class="button button--subtle" href="${reportOutlinePath(report, "sections", section.slug)}">Preview</a>
        <a class="button button--subtle" href="${reportOutlineExportPath(report, "section", section.slug)}" download>PDF</a>
      </nav>
    </header>
    ${section.subsections.length
      ? html`<ol class="report-subsection-list" data-report-subsection-list data-section-slug="${section.slug}">${section.subsections.map(subsection => renderReportSubsectionRow(report, subsection))}</ol>`
      : html`<p class="empty-state">No subsections in this outline block.</p>`}
  </article>`;
}

function renderReportGroup(report, group, index) {
  return html`<details class="report-group" ${index === 0 ? "open" : ""}>
    <summary class="report-group__summary">
      <div>
        <button class="report-drag-handle" type="button" draggable="true" data-reorder-handle aria-label="Drag chapter ${group.title}">
          <span aria-hidden="true"></span>
        </button>
        <span data-report-chapter-index>${String(index + 1).padStart(2, "0")}</span>
        <h3>${group.title}</h3>
      </div>
      <p>${group.sections.length} ${group.sections.length === 1 ? "section" : "sections"}</p>
    </summary>
    <div class="report-section-grid">
      ${group.sections.map(section => renderReportSectionCard(report, section))}
    </div>
  </details>`;
}

function renderEngineeringReportWorkspace(report) {
  if (!report) {
    return html`<section class="dashboard-section" id="engineering-reports" aria-labelledby="engineering-reports-heading">
      <div class="dashboard-section__header">
        <div class="dashboard-section__title">
          <p class="eyebrow">Technical reporting</p>
          <h2 id="engineering-reports-heading">Engineering report generation</h2>
        </div>
      </div>
      <p class="empty-state">No engineering report outline is available.</p>
    </section>`;
  }

  return html`<section class="dashboard-section" id="engineering-reports" aria-labelledby="engineering-reports-heading">
    <div class="dashboard-section__header">
      <div class="dashboard-section__title">
        <p class="eyebrow">Technical reporting</p>
        <h2 id="engineering-reports-heading">Engineering report generation</h2>
      </div>
      <div class="button-row">
        <p class="report-order-status" data-report-order-status role="status" aria-live="polite"></p>
        <a class="button button--subtle" href="${reportOutlinePath(report)}">Preview full report</a>
        <a class="button button--primary" href="${reportOutlineExportPath(report, "compile")}" download>Compile PDF</a>
      </div>
    </div>
    <div class="report-workspace" data-report-order-root data-report-slug="${report.slug}">
      <aside class="report-workspace__summary">
        <div class="report-workspace__summary-heading">
          <p class="eyebrow">Report navigator</p>
          <h3>${report.title}</h3>
        </div>
        <div class="report-stat-grid">
          ${reportStat("sections", report.sectionCount)}
          ${reportStat("subsections", report.subsectionCount)}
          ${reportStat("chapters", report.groups.length)}
        </div>
        <div class="report-anchor-block">
          <p>Chapters</p>
          <nav class="report-anchor-list" aria-label="Engineering report chapters">
            ${report.groups.map(group => html`<a href="#report-group-${group.slug}">${group.title}</a>`)}
          </nav>
        </div>
      </aside>
      <div class="report-workspace__body" data-report-chapter-list>
        ${report.groups.map((group, index) => html`<div id="report-group-${group.slug}" data-report-order-item="chapter" data-group-slug="${group.slug}">
          ${renderReportGroup(report, group, index)}
        </div>`)}
      </div>
    </div>
  </section>`;
}

function renderEngineeringReportSupport() {
  return html`<section class="dashboard-section dashboard-section--support" aria-labelledby="engineering-report-support-heading">
      <div class="dashboard-section__header">
        <div class="dashboard-section__title">
          <p class="eyebrow">Troubleshooting</p>
          <h2 id="engineering-report-support-heading">Need help with the report?</h2>
        </div>
      </div>
      <article class="support-contact-card">
        <div class="support-contact-card__profile">
          <img src="/assets/engineering-reports/report-coordinator-placeholder.svg" alt="Placeholder portrait for Alex Morgan, report coordinator">
          <div class="support-contact-card__copy">
            <span>Troubleshooting contact · Report coordinator</span>
            <h3>Alex Morgan</h3>
            <a href="mailto:alex.morgan@example.com">alex.morgan@example.com</a>
            <p>Contact Alex for access, subsection editing, ordering, preview, or PDF compilation issues.</p>
          </div>
        </div>
        <p class="support-contact-card__detail">Share the section or subsection number when reporting a problem.</p>
      </article>
    </section>`;
}

function renderEngineeringReportsDashboard(projects, engineeringReport) {
  return html`${renderEngineeringReportWorkspace(engineeringReport)}
    ${renderEngineeringReportSupport()}`;
}

function dashboardActiveView(value) {
  if (value === "bd-documents" || value === "engineering-reports") {
    return value;
  }

  if (value === "case-studies") {
    return value;
  }

  return null;
}

function renderActiveDashboard(activeView, projects, bdDocuments, engineeringReport) {
  if (activeView === "bd-documents") {
    return renderBdDashboard(bdDocuments);
  }

  if (activeView === "engineering-reports") {
    return renderEngineeringReportsDashboard(projects, engineeringReport);
  }

  return renderCaseStudyDashboard(projects);
}

function dashboardTitle(activeView) {
  return {
    "bd-documents": "Business development documents",
    "case-studies": "Case studies",
    "engineering-reports": "Engineering reports"
  }[activeView] || "Document collaboration";
}

export function renderDashboard(projects, bdDocuments = [], options = {}) {
  const activeView = dashboardActiveView(options.activeView);
  const engineeringReport = options.engineeringReport;
  const body = activeView ? html`<main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Portfolio system</p>
        <h1>Document Collaboration</h1>
      </div>
      <nav class="button-row" aria-label="Dashboard shortcuts">
        <a class="button button--subtle" href="/">Start</a>
        <a class="button button--subtle" href="/requests">Requests</a>
      </nav>
    </header>
    <nav class="dashboard-tabs" aria-label="Dashboard views">
      ${dashboardTab({
        activeView,
        count: projects.length,
        href: "/?view=case-studies",
        label: "Case studies",
        value: "case-studies"
      })}
      ${dashboardTab({
        activeView,
        count: bdDocuments.length,
        href: "/?view=bd-documents",
        label: "BD documents",
        value: "bd-documents"
      })}
      ${dashboardTab({
        activeView,
        count: projects.length,
        href: "/?view=engineering-reports",
        label: "Engineering reports",
        value: "engineering-reports"
      })}
    </nav>
    ${renderActiveDashboard(activeView, projects, bdDocuments, engineeringReport)}
  </main>` : renderLandingDashboard(projects, bdDocuments, engineeringReport);

  return renderDocument({
    title: dashboardTitle(activeView),
    body,
    bodyClass: "app-body",
    styles: ["/app/app.css"],
    scripts: activeView === "engineering-reports"
      ? ["/app/export-downloads-init.js", "/app/engineering-report.js"]
      : activeView
        ? ["/app/export-downloads-init.js"]
        : ["/app/export-downloads-init.js", "/app/dashboard.js"]
  });
}

export function renderBuilder(project, slug, options = {}) {
  const coverAsset = assetForSlot(project.assets, "cover", 0);
  const decisionsAsset = assetForSlot(project.assets, "decisions", 1);
  const outputsAsset = assetForSlot(project.assets, "outputs", 2);
  const body = html`<main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Editing ${slug}</p>
        <h1>${project.title || "Untitled case study"}</h1>
      </div>
      <nav class="button-row" aria-label="Project links">
        <a class="button button--subtle" href="/">Projects</a>
        <a class="button button--subtle" href="/requests">Requests</a>
        <a class="button button--subtle" href="/projects/${slug}" data-preview-link="true">Preview</a>
        ${actionMenu(slug)}
      </nav>
    </header>

    <form class="builder-form" id="project-form" data-information-subject-type="project" data-slug="${slug}" data-revision="${options.revision || "new"}" data-field-limits="${safeJson(PROJECT_CLIENT_FIELD_LIMITS)}">
      ${formCard("Metadata", html`<div class="field-grid">
          ${field("Title", "title", project.title)}
          ${textarea("Subtitle", "subtitle", project.subtitle, 3)}
          ${field("Year", "year", project.year)}
          ${field("Sector", "sector", project.sector)}
          ${field("Client type", "clientType", project.clientType)}
          ${field("Role", "role", project.role)}
          ${textarea("Collaborators", "collaborators", project.collaborators.join("\n"), 4)}
        </div>
        ${imagePlacement({
          title: "Cover image",
          description: "Appears on the cover page and sets the visual tone for the case study.",
          slot: "cover",
          item: coverAsset
        })}`, true)}

      ${formCard("Narrative", html`<div class="field-grid">
          ${textarea("Context", "context", project.context, 6)}
          ${textarea("Challenge", "challenge", project.challenge, 6)}
          ${textarea("Audience", "audience", project.audience, 5)}
          ${textarea("Approach", "approach", project.approach, 6)}
          ${textarea("Reflection", "reflection", project.reflection, 5)}
          ${textarea("Confidentiality notes", "confidentialityNotes", project.confidentialityNotes, 4)}
        </div>`)}

      ${formCard("Structured lists", html`<div class="structured-list-grid">
          ${structuredList({
            title: "Key decisions",
            listName: "keyDecisions",
            addLabel: "Add decision",
            items: project.keyDecisions,
            renderItem: (item, index) => renderTitleDescriptionItem(item, index, "Title")
          })}
          ${imagePlacement({
            title: "Key visual decisions image",
            description: "Appears on the key visual decisions page beside the decision cards.",
            slot: "decisions",
            item: decisionsAsset
          })}
          ${structuredList({
            title: "Outputs",
            listName: "outputs",
            addLabel: "Add output",
            items: project.outputs,
            renderItem: (item, index) => renderTitleDescriptionItem(item, index, "Title")
          })}
          ${imagePlacement({
            title: "Outputs image",
            description: "Appears on the outputs page beside the output cards.",
            slot: "outputs",
            item: outputsAsset
          })}
          ${structuredList({
            title: "Impact",
            listName: "impact",
            addLabel: "Add impact",
            items: project.impact,
            renderItem: renderImpactItem
          })}
        </div>`)}

      <footer class="form-actions">
        <button class="button button--primary" type="submit">Save JSON</button>
        <p id="save-status" role="status" aria-live="polite"></p>
      </footer>
    </form>
  </main>`;

  return renderDocument({
    title: `Edit ${project.title}`,
    body,
    bodyClass: "app-body",
    styles: ["/app/app.css"],
    scripts: ["/app/builder.js", "/app/information-requests.js"]
  });
}
