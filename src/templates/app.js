import { html } from "../lib/html.js";
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
      <a class="button button--primary" href="/api/projects/${project.slug}" download>JSON</a>
    </nav>
  </article>`;
}

function field(label, name, value, type = "text") {
  return html`<label class="field">
    <span>${label}</span>
    <input name="${name}" type="${type}" value="${text(value)}">
  </label>`;
}

function textarea(label, name, value, rows = 5) {
  return html`<label class="field field--wide">
    <span>${label}</span>
    <textarea name="${name}" rows="${rows}">${text(value)}</textarea>
  </label>`;
}

function itemField(label, fieldName, value) {
  return html`<label class="field">
    <span>${label}</span>
    <input type="text" data-field="${fieldName}" value="${text(value)}">
  </label>`;
}

function itemTextarea(label, fieldName, value) {
  return html`<label class="field field--wide">
    <span>${label}</span>
    <textarea data-field="${fieldName}" rows="3">${text(value)}</textarea>
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
      ${itemField("Image path", "path", item?.path)}
      ${visibilitySelect(item?.visibility)}
      ${itemTextarea("Caption", "caption", item?.caption)}
    </div>
  </section>`;
}

function renderTitleDescriptionItem(item, index, titleLabel = "Title") {
  return html`<article class="list-item" data-list-item>
    <header class="list-item__header">
      <h4>Item ${index + 1}</h4>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove item">Remove</button>
    </header>
    <div class="field-grid field-grid--item">
      ${itemField(titleLabel, titleLabel === "Metric" ? "metric" : "title", item?.[titleLabel === "Metric" ? "metric" : "title"])}
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
      ${itemField("Image path", "path", item?.path)}
      ${visibilitySelect(item?.visibility)}
      ${itemTextarea("Caption", "caption", item?.caption)}
    </div>
  </article>`;
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

export function renderDashboard(projects) {
  const body = html`<main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Portfolio system</p>
        <h1>Case studies</h1>
      </div>
      <nav class="button-row" aria-label="Project creation">
        <a class="button button--subtle" href="/builder/new-project">New project</a>
        <a class="button button--primary" href="/builder/${projects[0]?.slug || "uber-sample"}">Open builder</a>
      </nav>
    </header>
    <section class="project-list" aria-label="Projects">
      ${projects.map(renderProjectCard)}
    </section>
  </main>`;

  return renderDocument({
    title: "Case studies",
    body,
    bodyClass: "app-body",
    styles: ["/app/app.css"]
  });
}

export function renderBuilder(project, slug) {
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
        <a class="button button--subtle" href="/api/export/pdf/${slug}" data-pdf-link="true" download>Save PDF</a>
        <a class="button button--primary" href="/api/projects/${slug}" download data-json-link="true">JSON</a>
      </nav>
    </header>

    <form class="builder-form" id="project-form" data-slug="${slug}">
      <section class="form-card">
        <h2>Metadata</h2>
        <div class="field-grid">
          ${field("Title", "title", project.title)}
          ${field("Subtitle", "subtitle", project.subtitle)}
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
        })}
      </section>

      <section class="form-card">
        <h2>Narrative</h2>
        <div class="field-grid">
          ${textarea("Context", "context", project.context, 6)}
          ${textarea("Challenge", "challenge", project.challenge, 6)}
          ${textarea("Audience", "audience", project.audience, 5)}
          ${textarea("Approach", "approach", project.approach, 6)}
          ${textarea("Reflection", "reflection", project.reflection, 5)}
          ${textarea("Confidentiality notes", "confidentialityNotes", project.confidentialityNotes, 4)}
        </div>
      </section>

      <section class="form-card">
        <h2>Structured lists</h2>
        <div class="structured-list-grid">
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
            renderItem: (item, index) => renderTitleDescriptionItem(item, index, "Metric")
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
    title: `Edit ${project.title}`,
    body,
    bodyClass: "app-body",
    styles: ["/app/app.css"],
    scripts: ["/app/builder.js"]
  });
}
