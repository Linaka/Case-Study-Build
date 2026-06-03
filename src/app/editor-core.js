export const ACCEPTED_IMAGE_TYPES = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]);
export const ACCEPTED_PDF_TYPES = new Set(["application/pdf", "application/x-pdf"]);
export const ACCEPTED_WORD_TYPES = new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_WORD_BYTES = 10 * 1024 * 1024;

export function fieldLimitsFromForm(form) {
  try {
    return JSON.parse(form.dataset.fieldLimits || "{}");
  } catch {
    return {};
  }
}

export function valueFromForm(form, name) {
  const control = form.elements[name];

  if (!control) {
    throw new Error(`Missing form field: ${name}`);
  }

  return control.value.trim();
}

export function linesFromText(text) {
  return String(text ?? "").split(/\n+/).map(item => item.trim()).filter(Boolean);
}

export function linesFromForm(form, name) {
  return linesFromText(valueFromForm(form, name));
}

export function setStatus(element, message, state = "idle") {
  element.textContent = message;
  element.dataset.state = state;
}

export function setMeta(element, message, state = "idle") {
  if (element) {
    element.textContent = message;
    element.dataset.state = state;
  }
}

export function setSaving(form, isSaving, idleText = "Save JSON") {
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = isSaving;
    button.textContent = isSaving ? "Saving..." : idleText;
  }
}

export async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return body.error || `Request failed with HTTP ${response.status}.`;
  }

  return (await response.text()) || `Request failed with HTTP ${response.status}.`;
}

export function messageFromError(error) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function updateCharacterCounter(control) {
  const counter = control.closest(".field")?.querySelector("[data-character-counter]");

  if (counter) {
    counter.textContent = `${control.value.length}/${control.maxLength}`;
    counter.dataset.state = control.value.length >= control.maxLength ? "full" : "idle";
  }
}

export function attachCharacterCounter(control) {
  if (!control.maxLength || control.maxLength < 0 || control.dataset.characterCounterReady) {
    return;
  }

  const label = control.closest(".field");

  if (!label) {
    return;
  }

  const counter = document.createElement("small");
  counter.className = "field__counter";
  counter.dataset.characterCounter = "";
  control.dataset.characterCounterReady = "true";
  label.append(counter);
  updateCharacterCounter(control);
}

export function initializeCharacterCounters(root) {
  root.querySelectorAll("input[maxlength], textarea[maxlength]").forEach(attachCharacterCounter);
}

export function createInformationRequestButton(labelText) {
  const requestButton = document.createElement("button");

  requestButton.className = "information-request-button";
  requestButton.type = "button";
  requestButton.dataset.informationRequestButton = "";
  requestButton.setAttribute("aria-label", `Request information for ${labelText}`);
  requestButton.textContent = "Request information";
  return requestButton;
}

export function createFieldControl({
  labelText,
  fieldName,
  value = "",
  multiline = false,
  maxLength,
  type = "text",
  requestable = true
}) {
  const label = document.createElement("label");
  const labelRow = document.createElement("span");
  const labelTextNode = document.createElement("span");
  const control = document.createElement(multiline ? "textarea" : "input");

  label.className = multiline ? "field field--wide" : "field";
  labelRow.className = "field__label-row";
  labelTextNode.className = "field__label-text";
  labelTextNode.textContent = labelText;
  control.dataset.field = fieldName;
  control.value = value;

  if (multiline) {
    control.maxLength = maxLength;
    control.rows = 3;
  } else {
    control.type = type;
    if (type === "number") {
      control.step = "any";
    } else {
      control.maxLength = maxLength;
    }
  }

  labelRow.append(labelTextNode);

  if (requestable) {
    labelRow.append(createInformationRequestButton(labelText));
  }

  label.append(labelRow, control);
  attachCharacterCounter(control);
  return label;
}

export function createVisibilitySelect(value = "public") {
  const label = document.createElement("label");
  const labelTextNode = document.createElement("span");
  const select = document.createElement("select");

  label.className = "field";
  labelTextNode.textContent = "Visibility";
  select.dataset.field = "visibility";

  ["public", "private", "hidden"].forEach(optionValue => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue[0].toUpperCase() + optionValue.slice(1);
    option.selected = optionValue === value;
    select.append(option);
  });

  label.append(labelTextNode, select);
  return label;
}

export function createAssetLoader(path = "") {
  const loader = document.createElement("div");
  const preview = document.createElement("figure");
  const body = document.createElement("div");
  const headingText = document.createElement("h5");
  const guidance = document.createElement("p");
  const fileLabel = document.createElement("label");
  const fileInput = document.createElement("input");
  const meta = document.createElement("p");

  loader.className = "asset-loader";
  loader.dataset.assetLoader = "";
  preview.className = "asset-preview";
  preview.dataset.imagePreview = "";
  body.className = "asset-loader__body";
  headingText.textContent = "Add image";
  guidance.textContent = "Use SVG, PNG, JPG or WebP under 5 MB. Best results: 16:9 at 1600x900 px or 4:3 at 1600x1200 px.";
  fileLabel.className = "button button--subtle file-button";
  fileLabel.textContent = "Choose image";
  fileInput.type = "file";
  fileInput.dataset.imageInput = "";
  fileInput.accept = "image/svg+xml,image/png,image/jpeg,image/webp";
  meta.className = "asset-loader__meta";
  meta.dataset.imageMeta = "";
  meta.textContent = path ? "Image path is ready." : "No file loaded yet.";

  fileLabel.append(fileInput);
  body.append(headingText, guidance, fileLabel, meta);
  loader.append(preview, body);
  setAssetPreview(loader, path);

  return loader;
}

export function fieldValue(item, fieldName) {
  return item.querySelector(`[data-field="${fieldName}"]`)?.value.trim() || "";
}

export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function imageRatioLabel(width, height) {
  if (!width || !height) {
    return "Dimensions unavailable";
  }

  const ratio = width / height;

  if (Math.abs(ratio - 16 / 9) < 0.04) {
    return "16:9 frame";
  }

  if (Math.abs(ratio - 4 / 3) < 0.04) {
    return "4:3 frame";
  }

  return "Custom ratio";
}

export function setAssetPreview(container, path) {
  const preview = container.querySelector("[data-image-preview]") || container;
  preview.replaceChildren();

  if (!path) {
    const empty = document.createElement("span");
    empty.textContent = "No image selected";
    preview.append(empty);
    return;
  }

  const image = document.createElement("img");
  image.src = path;
  image.alt = "";
  preview.append(image);
}

export function setControlValue(control, nextValue, options = {}) {
  if (!control || nextValue === undefined || nextValue === null) {
    return false;
  }

  const value = Array.isArray(nextValue) && options.joinArrays
    ? nextValue.join("\n").trim()
    : String(nextValue).trim();

  if (!value) {
    return false;
  }

  control.value = value;
  updateCharacterCounter(control);
  return true;
}
