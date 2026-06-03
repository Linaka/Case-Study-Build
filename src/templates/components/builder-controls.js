import { html } from "../../lib/html.js";

export function text(value) {
  return String(value ?? "");
}

export function requestButton(label, enabled = true) {
  return enabled
    ? html`<button class="information-request-button" type="button" data-information-request-button aria-label="Request information for ${label}">Request information</button>`
    : "";
}

export function field({ label, name, value, type = "text", maxLength, requestable = true }) {
  return html`<label class="field">
    <span class="field__label-row"><span class="field__label-text">${label}</span>${requestButton(label, requestable)}</span>
    <input name="${name}" type="${type}" value="${text(value)}" maxlength="${maxLength}">
  </label>`;
}

export function textarea({ label, name, value, rows = 5, maxLength, requestable = true }) {
  return html`<label class="field field--wide">
    <span class="field__label-row"><span class="field__label-text">${label}</span>${requestButton(label, requestable)}</span>
    <textarea name="${name}" rows="${rows}" maxlength="${maxLength}">${text(value)}</textarea>
  </label>`;
}

export function itemField({ label, fieldName, value, maxLength, requestable = true }) {
  return html`<label class="field">
    <span class="field__label-row"><span class="field__label-text">${label}</span>${requestButton(label, requestable)}</span>
    <input type="text" data-field="${fieldName}" value="${text(value)}" maxlength="${maxLength}">
  </label>`;
}

export function itemNumberField({ label, fieldName, value }) {
  return html`<label class="field">
    <span>${label}</span>
    <input type="number" data-field="${fieldName}" value="${text(value)}" step="any">
  </label>`;
}

export function itemTextarea({ label, fieldName, value, rows = 3, maxLength, requestable = true }) {
  return html`<label class="field field--wide">
    <span class="field__label-row"><span class="field__label-text">${label}</span>${requestButton(label, requestable)}</span>
    <textarea data-field="${fieldName}" rows="${rows}" maxlength="${maxLength}">${text(value)}</textarea>
  </label>`;
}

export function visibilitySelect({ value, fallback = "public" }) {
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

export function imageLoader(imagePath, metaText = "Image path is ready.") {
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

export function imagePlacement({ title, description, slot, item, limits, fallbackVisibility = "public" }) {
  return html`<section class="image-placement" data-asset-slot="${slot}" data-list-item>
    <header class="image-placement__header">
      <div>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
    </header>
    ${imageLoader(item?.path)}
    <div class="field-grid field-grid--item">
      ${itemField({ label: "Image path", fieldName: "path", value: item?.path, maxLength: limits.assetPath, requestable: false })}
      ${visibilitySelect({ value: item?.visibility, fallback: fallbackVisibility })}
      ${itemTextarea({ label: "Caption", fieldName: "caption", value: item?.caption, maxLength: limits.assetCaption, requestable: false })}
    </div>
  </section>`;
}

export function formCard(title, children, open = false) {
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

export function structuredList({ title, listName, addLabel, items, renderItem }) {
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
