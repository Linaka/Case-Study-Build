import { html } from "../lib/html.js";
import { BD_FIELD_LIMITS } from "../lib/limits.js";
import { renderDocument } from "./layout.js";

function text(value) {
  return String(value ?? "");
}

function field(label, name, value, type = "text", maxLength = BD_FIELD_LIMITS[name]) {
  return html`<label class="field">
    <span>${label}</span>
    <input name="${name}" type="${type}" value="${text(value)}" maxlength="${maxLength}">
  </label>`;
}

function textarea(label, name, value, rows = 5, maxLength = BD_FIELD_LIMITS[name]) {
  return html`<label class="field field--wide">
    <span>${label}</span>
    <textarea name="${name}" rows="${rows}" maxlength="${maxLength}">${text(value)}</textarea>
  </label>`;
}

function itemField(label, fieldName, value, maxLength = BD_FIELD_LIMITS.titleListTitle) {
  return html`<label class="field">
    <span>${label}</span>
    <input type="text" data-field="${fieldName}" value="${text(value)}" maxlength="${maxLength}">
  </label>`;
}

function itemTextarea(label, fieldName, value, rows = 3, maxLength = BD_FIELD_LIMITS.titleListDescription) {
  return html`<label class="field field--wide">
    <span>${label}</span>
    <textarea data-field="${fieldName}" rows="${rows}" maxlength="${maxLength}">${text(value)}</textarea>
  </label>`;
}

function visibilitySelect(value, fallback = "private") {
  const selected = text(value || fallback);

  return html`<label class="field">
    <span>Visibility</span>
    <select data-field="visibility">
      <option value="public" ${selected === "public" ? "selected" : ""}>Public</option>
      <option value="private" ${selected === "private" ? "selected" : ""}>Private</option>
      <option value="hidden" ${selected === "hidden" ? "selected" : ""}>Hidden</option>
    </select>
  </label>`;
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

function assetForSlot(assets, slot, fallbackIndex) {
  return assets.find(asset => text(asset?.slot) === slot) || assets[fallbackIndex] || {};
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
      ${itemField("Image path", "path", item?.path, BD_FIELD_LIMITS.assetPath)}
      ${visibilitySelect(item?.visibility, "public")}
      ${itemTextarea("Caption", "caption", item?.caption, 3, BD_FIELD_LIMITS.assetCaption)}
    </div>
  </section>`;
}

function structuredList({ title, listName, addLabel, items, renderItem }) {
  return html`<section class="list-editor" data-list="${listName}">
    <header class="list-editor__header">
      <h3>${title}</h3>
      <button class="button button--subtle" type="button" data-add-item="${listName}">${addLabel}</button>
    </header>
    <div class="list-items" data-list-items>
      ${items.map(renderItem)}
    </div>
  </section>`;
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
      ${itemField("Project slug", "projectSlug", item?.projectSlug, BD_FIELD_LIMITS.proofProjectSlug)}
      ${visibilitySelect(item?.visibility, "private")}
      ${itemField("Asset path", "assetPath", item?.assetPath, BD_FIELD_LIMITS.proofAssetPath)}
      ${itemTextarea("Problem", "problem", item?.problem, 3, BD_FIELD_LIMITS.proofBody)}
      ${itemTextarea("Intervention", "intervention", item?.intervention, 3, BD_FIELD_LIMITS.proofBody)}
      ${itemTextarea("Outcome", "outcome", item?.outcome, 3, BD_FIELD_LIMITS.proofBody)}
      ${itemTextarea("Evidence", "evidence", item?.evidence, 3, BD_FIELD_LIMITS.proofBody)}
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
      ${itemTextarea("Best for", "bestFor", item?.bestFor, 3, BD_FIELD_LIMITS.engagementBody)}
      ${itemTextarea("Scope", "scope", item?.scope, 3, BD_FIELD_LIMITS.engagementBody)}
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
        <a class="button button--subtle" href="/bd/${slug}" data-preview-link="true">Preview</a>
        <a class="button button--subtle" href="/api/export/bd/pdf/${slug}" data-pdf-link="true" download>Save PDF</a>
        <a class="button button--primary" href="/api/bd-documents/${slug}" download data-json-link="true">JSON</a>
      </nav>
    </header>

    <form class="builder-form" id="bd-document-form" data-slug="${slug}" data-revision="${options.revision || "new"}">
      <section class="form-card">
        <h2>Positioning</h2>
        <div class="field-grid">
          ${field("Title", "title", document.title)}
          ${field("Subtitle", "subtitle", document.subtitle)}
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
        })}
      </section>

      <section class="form-card">
        <h2>Offer narrative</h2>
        <div class="field-grid">
          ${textarea("Process summary", "processSummary", document.processSummary, 5)}
          ${textarea("Next steps", "nextSteps", document.nextSteps, 5)}
          ${field("Primary CTA", "primaryCta", document.primaryCta)}
          ${field("Secondary CTA", "secondaryCta", document.secondaryCta)}
          ${textarea("Confidentiality notes", "confidentialityNotes", document.confidentialityNotes, 4)}
        </div>
      </section>

      <section class="form-card">
        <h2>Business development sections</h2>
        <div class="structured-list-grid">
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
        </div>
      </section>

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
    scripts: ["/app/bd-builder.js"]
  });
}
