import { html, safeJson } from "../lib/html.js";
import { PROJECT_CLIENT_FIELD_LIMITS, PROJECT_FIELD_LIMITS } from "../lib/limits.js";
import { renderDocument } from "./layout.js";

function text(value) {
  return String(value ?? "");
}

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

function field(label, name, value, type = "text", maxLength = PROJECT_FIELD_LIMITS[name]) {
  return html`<label class="field">
    <span>${label}</span>
    <input name="${name}" type="${type}" value="${text(value)}" maxlength="${maxLength}">
  </label>`;
}

function textarea(label, name, value, rows = 5, maxLength = PROJECT_FIELD_LIMITS[name]) {
  return html`<label class="field field--wide">
    <span>${label}</span>
    <textarea name="${name}" rows="${rows}" maxlength="${maxLength}">${text(value)}</textarea>
  </label>`;
}

function itemField(label, fieldName, value, maxLength = PROJECT_FIELD_LIMITS.titleListTitle) {
  return html`<label class="field">
    <span>${label}</span>
    <input type="text" data-field="${fieldName}" value="${text(value)}" maxlength="${maxLength}">
  </label>`;
}

function itemNumberField(label, fieldName, value) {
  return html`<label class="field">
    <span>${label}</span>
    <input type="number" data-field="${fieldName}" value="${text(value)}" step="any">
  </label>`;
}

function itemTextarea(label, fieldName, value, maxLength = PROJECT_FIELD_LIMITS.titleListDescription) {
  return html`<label class="field field--wide">
    <span>${label}</span>
    <textarea data-field="${fieldName}" rows="3" maxlength="${maxLength}">${text(value)}</textarea>
  </label>`;
}

function visibilitySelect(value) {
  const selected = text(value || "public");

  return html`<label class="field">
    <span>Visibility</span>
    <select data-field="visibility">
      <option value="public" ${selected === "public" ? "selected" : ""}>Public</option>
      <option value="private" ${selected === "private" ? "selected" : ""}>Private</option>
      <option value="hidden" ${selected === "hidden" ? "selected" : ""}>Hidden</option>
    </select>
  </label>`;
}

function assetForSlot(assets, slot, fallbackIndex) {
  return assets.find(asset => text(asset?.slot) === slot) || assets[fallbackIndex] || {};
}

function imageLoader(imagePath, metaText = "Image path is ready.") {
  const path = text(imagePath);

  return html`<div class="asset-loader" data-asset-loader>
    <figure class="asset-preview" data-image-preview>
      ${path ? html`<img src="${path}" alt="">` : html`<span>No image selected</span>`}
    </figure>
    <div class="asset-loader__body">
      <h5>Add image</h5>
      <p>Use SVG, PNG, JPG or WebP under 5 MB. Best results: 16:9 at 1600x900 px or 4:3 at 1600x1200 px.</p>
      <label class="button button--subtle file-button">
        Choose image
        <input type="file" data-image-input accept="image/svg+xml,image/png,image/jpeg,image/webp">
      </label>
      <p class="asset-loader__meta" data-image-meta>${path ? metaText : "No file loaded yet."}</p>
    </div>
  </div>`;
}

function imagePlacement({ title, description, slot, item }) {
  return html`<section class="image-placement" data-asset-slot="${slot}" data-list-item>
    <header class="image-placement__header">
      <div>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
    </header>
    ${imageLoader(item?.path)}
    <div class="field-grid field-grid--item">
      ${itemField("Image path", "path", item?.path, PROJECT_FIELD_LIMITS.assetPath)}
      ${visibilitySelect(item?.visibility)}
      ${itemTextarea("Caption", "caption", item?.caption, PROJECT_FIELD_LIMITS.assetCaption)}
    </div>
  </section>`;
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
      ${itemField("Image path", "path", item?.path, PROJECT_FIELD_LIMITS.assetPath)}
      ${visibilitySelect(item?.visibility)}
      ${itemTextarea("Caption", "caption", item?.caption, PROJECT_FIELD_LIMITS.assetCaption)}
    </div>
  </article>`;
}

function formCard(title, children, open = false) {
  return html`<details class="form-card form-card--collapsible" ${open ? "open" : ""}>
    <summary class="form-card__summary">
      <h2>${title}</h2>
      <span aria-hidden="true"></span>
    </summary>
    <div class="form-card__body">
      ${children}
    </div>
  </details>`;
}

function structuredList({ title, listName, addLabel, items, renderItem }) {
  return html`<details class="list-editor" data-list="${listName}">
    <summary class="list-editor__summary">
      <h3>${title}</h3>
      <span>${items.length} ${items.length === 1 ? "item" : "items"}</span>
    </summary>
    <div class="list-editor__body">
      <header class="list-editor__header">
      <button class="button button--subtle" type="button" data-add-item="${listName}">${addLabel}</button>
      </header>
      <div class="list-items" data-list-items>
        ${items.map(renderItem)}
      </div>
    </div>
  </details>`;
}

function dashboardTab({ activeView, count, href, label, value }) {
  const isActive = activeView === value;

  return html`<a class="dashboard-tab${isActive ? " dashboard-tab--active" : ""}" href="${href}" aria-current="${isActive ? "page" : "false"}">
    <span>${label}</span>
    <span class="dashboard-tab__count">${count}</span>
  </a>`;
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
      <a class="button button--primary" href="/bd-builder/new-business-development-doc">New BD document</a>
    </div>
    <div class="project-list">
      ${bdDocuments.length
        ? bdDocuments.map(renderBdDocumentCard)
        : html`<p class="empty-state">No business development documents yet.</p>`}
    </div>
  </section>`;
}

export function renderDashboard(projects, bdDocuments = [], options = {}) {
  const activeView = options.activeView === "bd-documents" ? "bd-documents" : "case-studies";
  const body = html`<main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Portfolio system</p>
        <h1>Case studies and business development docs</h1>
      </div>
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
    </nav>
    ${activeView === "bd-documents" ? renderBdDashboard(bdDocuments) : renderCaseStudyDashboard(projects)}
  </main>`;

  return renderDocument({
    title: activeView === "bd-documents" ? "Business development documents" : "Case studies",
    body,
    bodyClass: "app-body",
    styles: ["/app/app.css"]
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
        <a class="button button--subtle" href="/projects/${slug}" data-preview-link="true">Preview</a>
        ${actionMenu(slug)}
      </nav>
    </header>

    <form class="builder-form" id="project-form" data-slug="${slug}" data-revision="${options.revision || "new"}" data-field-limits="${safeJson(PROJECT_CLIENT_FIELD_LIMITS)}">
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
    scripts: ["/app/builder.js"]
  });
}
