import { html, safeJson } from "../lib/html.js";
import { BD_CLIENT_FIELD_LIMITS, BD_FIELD_LIMITS } from "../lib/limits.js";
import {
  field as builderField,
  formCard,
  imageLoader,
  imagePlacement as builderImagePlacement,
  itemField as builderItemField,
  itemTextarea as builderItemTextarea,
  structuredList,
  text,
  textarea as builderTextarea,
  visibilitySelect as builderVisibilitySelect
} from "./components/builder-controls.js";
import { renderDocument } from "./layout.js";

function field(label, name, value, type = "text", maxLength = BD_FIELD_LIMITS[name]) {
  return builderField({ label, name, value, type, maxLength });
}

function textarea(label, name, value, rows = 5, maxLength = BD_FIELD_LIMITS[name]) {
  return builderTextarea({ label, name, value, rows, maxLength });
}

function itemField(label, fieldName, value, maxLength = BD_FIELD_LIMITS.titleListTitle, requestable = true) {
  return builderItemField({ label, fieldName, value, maxLength, requestable });
}

function itemTextarea(label, fieldName, value, rows = 3, maxLength = BD_FIELD_LIMITS.titleListDescription, requestable = true) {
  return builderItemTextarea({ label, fieldName, value, rows, maxLength, requestable });
}

function visibilitySelect(value, fallback = "private") {
  return builderVisibilitySelect({ value, fallback });
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
    limits: BD_FIELD_LIMITS,
    fallbackVisibility: "public"
  });
}

function actionMenu(slug) {
  return html`<details class="action-menu">
    <summary class="button button--primary">Import / Export</summary>
    <div class="action-menu__panel">
      <section class="action-menu__group" aria-labelledby="bd-import-actions">
        <h2 id="bd-import-actions">Import</h2>
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
      <section class="action-menu__group" aria-labelledby="bd-export-actions">
        <h2 id="bd-export-actions">Export</h2>
        <a class="action-menu__item" href="/api/export/bd/word/${slug}" data-word-link="true" download>Export Word</a>
        <a class="action-menu__item" href="/api/export/bd/pdf/${slug}" data-pdf-link="true" download>Export PDF</a>
        <a class="action-menu__item" href="/api/export/bd/banner/${slug}" data-banner-link="true" download>Export marketing banner</a>
        <a class="action-menu__item" href="/api/bd-documents/${slug}" download data-json-link="true">Export JSON</a>
      </section>
    </div>
  </details>`;
}

function renderTitleDescriptionItem(item, index) {
  return html`<article class="list-item" data-list-item>
    <header class="list-item__header">
      <h4>Item ${index + 1}</h4>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove item">Remove</button>
    </header>
    <div class="field-grid field-grid--item">
      ${itemField("Title", "title", item?.title, BD_FIELD_LIMITS.titleListTitle)}
      ${itemTextarea("Description", "description", item?.description)}
    </div>
  </article>`;
}

function renderOfferPillar(item, index) {
  return html`<article class="list-item" data-list-item>
    <header class="list-item__header">
      <h4>Pillar ${index + 1}</h4>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove offer pillar">Remove</button>
    </header>
    <div class="field-grid field-grid--item">
      ${itemField("Title", "title", item?.title, BD_FIELD_LIMITS.offerTitle)}
      ${itemTextarea("Description", "description", item?.description, 3, BD_FIELD_LIMITS.offerDescription)}
      ${itemTextarea("Deliverables", "deliverables", Array.isArray(item?.deliverables) ? item.deliverables.join("\n") : item?.deliverables, 4, BD_FIELD_LIMITS.offerDeliverables)}
    </div>
  </article>`;
}

function renderProofSection(item, index) {
  return html`<article class="list-item bd-proof-editor" data-list-item>
    <header class="list-item__header">
      <h4>Proof ${index + 1}</h4>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove proof section">Remove</button>
    </header>
    ${imageLoader(item?.assetPath)}
    <div class="field-grid field-grid--item">
      ${itemField("Headline", "headline", item?.headline, BD_FIELD_LIMITS.proofHeadline)}
      ${itemField("Client context", "clientContext", item?.clientContext, BD_FIELD_LIMITS.proofClientContext)}
      ${itemField("Project slug", "projectSlug", item?.projectSlug, BD_FIELD_LIMITS.proofProjectSlug, false)}
      ${visibilitySelect(item?.visibility, "private")}
      ${itemField("Asset path", "assetPath", item?.assetPath, BD_FIELD_LIMITS.proofAssetPath, false)}
      ${itemTextarea("Problem", "problem", item?.problem, 3, BD_FIELD_LIMITS.proofProblem)}
      ${itemTextarea("Intervention", "intervention", item?.intervention, 3, BD_FIELD_LIMITS.proofIntervention)}
      ${itemTextarea("Outcome", "outcome", item?.outcome, 3, BD_FIELD_LIMITS.proofOutcome)}
      ${itemTextarea("Evidence", "evidence", item?.evidence, 3, BD_FIELD_LIMITS.proofEvidence)}
    </div>
  </article>`;
}

function renderEngagementModel(item, index) {
  return html`<article class="list-item" data-list-item>
    <header class="list-item__header">
      <h4>Model ${index + 1}</h4>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove engagement model">Remove</button>
    </header>
    <div class="field-grid field-grid--item">
      ${itemField("Title", "title", item?.title, BD_FIELD_LIMITS.engagementTitle)}
      ${itemField("Timeline", "timeline", item?.timeline, BD_FIELD_LIMITS.engagementTimeline)}
      ${itemTextarea("Best for", "bestFor", item?.bestFor, 3, BD_FIELD_LIMITS.engagementBestFor)}
      ${itemTextarea("Scope", "scope", item?.scope, 3, BD_FIELD_LIMITS.engagementScope)}
    </div>
  </article>`;
}

export function renderBdBuilder(document, slug, options = {}) {
  const coverAsset = assetForSlot(document.assets, "cover", 0);
  const body = html`<main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Editing business development document ${slug}</p>
        <h1>${document.title || "Untitled business development document"}</h1>
      </div>
      <nav class="button-row" aria-label="Business development document links">
        <a class="button button--subtle" href="/">Projects</a>
        <a class="button button--subtle" href="/requests">Requests</a>
        <a class="button button--subtle" href="/bd/${slug}" data-preview-link="true">Preview</a>
        ${actionMenu(slug)}
      </nav>
    </header>

    <form class="builder-form" id="bd-document-form" data-information-subject-type="bd-document" data-slug="${slug}" data-revision="${options.revision || "new"}" data-field-limits="${safeJson(BD_CLIENT_FIELD_LIMITS)}">
      ${formCard("Positioning", html`<div class="field-grid">
          ${field("Title", "title", document.title)}
          ${textarea("Subtitle", "subtitle", document.subtitle, 3)}
          ${field("Year", "year", document.year)}
          ${field("Audience", "audience", document.audience)}
          ${textarea("Executive promise", "executivePromise", document.executivePromise, 5)}
          ${textarea("Positioning", "positioning", document.positioning, 6)}
        </div>
        ${imagePlacement({
          title: "Cover image",
          description: "Appears on the cover page of the business development PDF.",
          slot: "cover",
          item: coverAsset
        })}`, true)}

      ${formCard("Offer narrative", html`<div class="field-grid">
          ${textarea("Process summary", "processSummary", document.processSummary, 5)}
          ${textarea("Next steps", "nextSteps", document.nextSteps, 5)}
          ${field("Primary CTA", "primaryCta", document.primaryCta)}
          ${field("Secondary CTA", "secondaryCta", document.secondaryCta)}
          ${textarea("Confidentiality notes", "confidentialityNotes", document.confidentialityNotes, 4)}
        </div>`)}

      ${formCard("Business development sections", html`<div class="structured-list-grid">
          ${structuredList({
            title: "Buyer problems",
            listName: "buyerProblems",
            addLabel: "Add problem",
            items: document.buyerProblems,
            renderItem: renderTitleDescriptionItem
          })}
          ${structuredList({
            title: "Offer pillars",
            listName: "offerPillars",
            addLabel: "Add pillar",
            items: document.offerPillars,
            renderItem: renderOfferPillar
          })}
          ${structuredList({
            title: "Process",
            listName: "process",
            addLabel: "Add step",
            items: document.process,
            renderItem: renderTitleDescriptionItem
          })}
          ${structuredList({
            title: "Proof sections",
            listName: "proofSections",
            addLabel: "Add proof",
            items: document.proofSections,
            renderItem: renderProofSection
          })}
          ${structuredList({
            title: "Engagement models",
            listName: "engagementModels",
            addLabel: "Add model",
            items: document.engagementModels,
            renderItem: renderEngagementModel
          })}
        </div>`)}

      <footer class="form-actions">
        <button class="button button--primary" type="submit">Save JSON</button>
        <p id="save-status" role="status" aria-live="polite"></p>
      </footer>
    </form>
  </main>`;

  return renderDocument({
    title: `Edit ${document.title}`,
    body,
    bodyClass: "app-body",
    styles: ["/app/app.css"],
    scripts: ["/app/bd-builder.js", "/app/information-requests.js"]
  });
}
