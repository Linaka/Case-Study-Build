const form = document.querySelector("#bd-document-form");
const status = document.querySelector("#save-status");
const heading = document.querySelector(".app-header h1");
const previewLink = document.querySelector("[data-preview-link]");
const jsonLink = document.querySelector("[data-json-link]");
const pdfLink = document.querySelector("[data-pdf-link]");
const ACCEPTED_IMAGE_TYPES = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FIELD_LIMITS = {
  title: 82,
  subtitle: 220,
  year: 16,
  audience: 82,
  positioning: 460,
  executivePromise: 260,
  processSummary: 320,
  nextSteps: 360,
  primaryCta: 56,
  secondaryCta: 64,
  confidentialityNotes: 260,
  itemTitle: 56,
  itemDescription: 170,
  deliverables: 180,
  headline: 78,
  clientContext: 56,
  projectSlug: 72,
  assetPath: 300,
  path: 300,
  problem: 190,
  intervention: 210,
  outcome: 170,
  evidence: 140,
  proofBody: 210,
  timeline: 28,
  bestFor: 120,
  scope: 150,
  caption: 140
};

if (!form || !status) {
  throw new Error("Business development builder form could not be initialised.");
}

function value(name) {
  const control = form.elements[name];

  if (!control) {
    throw new Error(`Missing form field: ${name}`);
  }

  return control.value.trim();
}

function linesFromText(text) {
  return String(text ?? "").split(/\n+/).map(item => item.trim()).filter(Boolean);
}

function lines(name) {
  return linesFromText(value(name));
}

function setStatus(message, state = "idle") {
  status.textContent = message;
  status.dataset.state = state;
}

function setSaving(isSaving) {
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = isSaving;
    button.textContent = isSaving ? "Saving..." : "Save JSON";
  }
}

function syncChrome(documentData) {
  if (heading) {
    heading.textContent = documentData.title || "Untitled business development document";
  }

  document.title = `Edit ${documentData.title || "Untitled business development document"}`;

  if (previewLink) {
    previewLink.href = `/bd/${form.dataset.slug}`;
  }

  if (jsonLink) {
    jsonLink.href = `/api/bd-documents/${form.dataset.slug}`;
  }

  if (pdfLink) {
    pdfLink.href = `/api/export/bd/pdf/${form.dataset.slug}`;
  }
}

async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return body.error || `Request failed with HTTP ${response.status}.`;
  }

  return (await response.text()) || `Request failed with HTTP ${response.status}.`;
}

function messageFromError(error) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function limitForField(fieldName) {
  return {
    bestFor: FIELD_LIMITS.proofBody,
    description: FIELD_LIMITS.itemDescription,
    evidence: FIELD_LIMITS.proofBody,
    intervention: FIELD_LIMITS.proofBody,
    outcome: FIELD_LIMITS.proofBody,
    problem: FIELD_LIMITS.proofBody,
    scope: FIELD_LIMITS.proofBody
  }[fieldName] || FIELD_LIMITS[fieldName] || FIELD_LIMITS.itemDescription;
}

function updateCharacterCounter(control) {
  const counter = control.closest(".field")?.querySelector("[data-character-counter]");

  if (counter) {
    counter.textContent = `${control.value.length}/${control.maxLength}`;
    counter.dataset.state = control.value.length >= control.maxLength ? "full" : "idle";
  }
}

function attachCharacterCounter(control) {
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

function initializeCharacterCounters(root = form) {
  root.querySelectorAll("input[maxlength], textarea[maxlength]").forEach(attachCharacterCounter);
}

function createField(labelText, fieldName, value = "", multiline = false, maxLength = limitForField(fieldName)) {
  const label = document.createElement("label");
  const labelTextNode = document.createElement("span");
  const control = document.createElement(multiline ? "textarea" : "input");

  label.className = multiline ? "field field--wide" : "field";
  labelTextNode.textContent = labelText;
  control.dataset.field = fieldName;
  control.maxLength = maxLength;
  control.value = value;

  if (multiline) {
    control.rows = 3;
  } else {
    control.type = "text";
  }

  label.append(labelTextNode, control);
  attachCharacterCounter(control);
  return label;
}

function createVisibilitySelect(value = "private") {
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

function createAssetLoader(path = "") {
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

function createListItem(listName) {
  const item = document.createElement("article");
  const header = document.createElement("header");
  const headingText = document.createElement("h4");
  const removeButton = document.createElement("button");
  const grid = document.createElement("div");

  item.className = listName === "proofSections" ? "list-item bd-proof-editor" : "list-item";
  item.dataset.listItem = "";
  header.className = "list-item__header";
  removeButton.className = "icon-button";
  removeButton.type = "button";
  removeButton.dataset.removeItem = "";
  removeButton.textContent = "Remove";
  grid.className = "field-grid field-grid--item";

  if (listName === "offerPillars") {
    headingText.textContent = "Pillar";
    removeButton.setAttribute("aria-label", "Remove offer pillar");
    grid.append(
      createField("Title", "title"),
      createField("Description", "description", "", true),
      createField("Deliverables", "deliverables", "", true)
    );
  } else if (listName === "proofSections") {
    headingText.textContent = "Proof";
    removeButton.setAttribute("aria-label", "Remove proof section");
    grid.append(
      createField("Headline", "headline"),
      createField("Client context", "clientContext"),
      createField("Project slug", "projectSlug"),
      createVisibilitySelect("private"),
      createField("Asset path", "assetPath"),
      createField("Problem", "problem", "", true),
      createField("Intervention", "intervention", "", true),
      createField("Outcome", "outcome", "", true),
      createField("Evidence", "evidence", "", true)
    );
  } else if (listName === "engagementModels") {
    headingText.textContent = "Model";
    removeButton.setAttribute("aria-label", "Remove engagement model");
    grid.append(
      createField("Title", "title"),
      createField("Timeline", "timeline"),
      createField("Best for", "bestFor", "", true),
      createField("Scope", "scope", "", true)
    );
  } else {
    headingText.textContent = "Item";
    removeButton.setAttribute("aria-label", "Remove item");
    grid.append(
      createField("Title", "title"),
      createField("Description", "description", "", true)
    );
  }

  header.append(headingText, removeButton);
  item.append(header);

  if (listName === "proofSections") {
    item.append(createAssetLoader());
  }

  item.append(grid);
  return item;
}

function updateListLabels(listEditor) {
  const listName = listEditor.dataset.list;
  const label = {
    offerPillars: "Pillar",
    proofSections: "Proof",
    engagementModels: "Model"
  }[listName] || "Item";

  listEditor.querySelectorAll("[data-list-item]").forEach((item, index) => {
    const headingText = item.querySelector("h4");
    if (headingText) {
      headingText.textContent = `${label} ${index + 1}`;
    }
  });
}

function addListItem(listName) {
  const listEditor = form.querySelector(`[data-list="${listName}"]`);
  const items = listEditor?.querySelector("[data-list-items]");

  if (!listEditor || !items) {
    throw new Error(`Could not find ${listName} editor.`);
  }

  items.append(createListItem(listName));
  updateListLabels(listEditor);
}

function removeListItem(button) {
  const item = button.closest("[data-list-item]");
  const listEditor = button.closest("[data-list]");

  item?.remove();

  if (listEditor) {
    updateListLabels(listEditor);
  }
}

function fieldValue(item, fieldName) {
  return item.querySelector(`[data-field="${fieldName}"]`)?.value.trim() || "";
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function imageRatioLabel(width, height) {
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

function setAssetMeta(item, message, state = "idle") {
  const meta = item.querySelector("[data-image-meta]");

  if (meta) {
    meta.textContent = message;
    meta.dataset.state = state;
  }
}

function setAssetPreview(container, path) {
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

function setImagePath(item, path) {
  const pathField = item.querySelector('[data-field="assetPath"]') || item.querySelector('[data-field="path"]');

  if (pathField) {
    pathField.value = path;
    updateCharacterCounter(pathField);
  }

  setAssetPreview(item, path);
}

async function readImageDimensions(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
      image.onerror = () => reject(new Error("Could not read image dimensions."));
    });

    image.src = objectUrl;
    return await loaded;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function validateImageFile(file) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Use SVG, PNG, JPG or WebP.");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image file is too large. Use a file under 5 MB.");
  }

  return readImageDimensions(file);
}

async function uploadImage(item, file) {
  setAssetMeta(item, "Checking image...", "pending");

  const dimensions = await validateImageFile(file);
  const ratioLabel = imageRatioLabel(dimensions.width, dimensions.height);

  setAssetMeta(item, `Uploading ${file.type.replace("image/", "").toUpperCase()} · ${dimensions.width}x${dimensions.height} px · ${formatFileSize(file.size)} · ${ratioLabel}`, "pending");

  const response = await fetch(`/api/assets/${form.dataset.slug}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": file.name.replace(/[^\x20-\x7E]/g, "-")
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const uploaded = await response.json();
  setImagePath(item, uploaded.path);
  setAssetMeta(item, `Loaded ${dimensions.width}x${dimensions.height} px ${ratioLabel}. Save JSON to keep this image in the document.`, "success");
  setStatus("Image loaded. Save JSON to keep it in the document.", "success");
}

function collectTitleDescriptionList(listName) {
  return Array.from(form.querySelectorAll(`[data-list="${listName}"] [data-list-item]`))
    .map(item => {
      const entry = {
        title: fieldValue(item, "title"),
        description: fieldValue(item, "description")
      };

      return entry.title || entry.description ? entry : null;
    })
    .filter(Boolean);
}

function collectOfferPillars() {
  return Array.from(form.querySelectorAll('[data-list="offerPillars"] [data-list-item]'))
    .map(item => {
      const entry = {
        title: fieldValue(item, "title"),
        description: fieldValue(item, "description"),
        deliverables: linesFromText(fieldValue(item, "deliverables"))
      };

      return entry.title || entry.description || entry.deliverables.length ? entry : null;
    })
    .filter(Boolean);
}

function collectProofSections() {
  return Array.from(form.querySelectorAll('[data-list="proofSections"] [data-list-item]'))
    .map(item => {
      const entry = {
        headline: fieldValue(item, "headline"),
        clientContext: fieldValue(item, "clientContext"),
        problem: fieldValue(item, "problem"),
        intervention: fieldValue(item, "intervention"),
        outcome: fieldValue(item, "outcome"),
        evidence: fieldValue(item, "evidence"),
        projectSlug: fieldValue(item, "projectSlug"),
        assetPath: fieldValue(item, "assetPath"),
        visibility: fieldValue(item, "visibility") || "private"
      };

      return entry.headline || entry.problem || entry.intervention || entry.outcome || entry.evidence || entry.assetPath ? entry : null;
    })
    .filter(Boolean);
}

function collectEngagementModels() {
  return Array.from(form.querySelectorAll('[data-list="engagementModels"] [data-list-item]'))
    .map(item => {
      const entry = {
        title: fieldValue(item, "title"),
        bestFor: fieldValue(item, "bestFor"),
        scope: fieldValue(item, "scope"),
        timeline: fieldValue(item, "timeline")
      };

      return entry.title || entry.bestFor || entry.scope || entry.timeline ? entry : null;
    })
    .filter(Boolean);
}

function collectAssets() {
  return Array.from(form.querySelectorAll("[data-asset-slot]"))
    .map(item => {
      const asset = {
        path: fieldValue(item, "path"),
        caption: fieldValue(item, "caption"),
        visibility: fieldValue(item, "visibility") || "public",
        slot: item.dataset.assetSlot
      };

      return asset.path || asset.caption ? asset : null;
    })
    .filter(Boolean);
}

function readDocument() {
  return {
    title: value("title"),
    subtitle: value("subtitle"),
    year: value("year"),
    audience: value("audience"),
    positioning: value("positioning"),
    executivePromise: value("executivePromise"),
    buyerProblems: collectTitleDescriptionList("buyerProblems"),
    offerPillars: collectOfferPillars(),
    processSummary: value("processSummary"),
    process: collectTitleDescriptionList("process"),
    proofSections: collectProofSections(),
    engagementModels: collectEngagementModels(),
    nextSteps: value("nextSteps"),
    primaryCta: value("primaryCta"),
    secondaryCta: value("secondaryCta"),
    confidentialityNotes: value("confidentialityNotes"),
    assets: collectAssets()
  };
}

async function saveDocument() {
  const documentData = readDocument();
  const revision = form.dataset.revision || "new";

  setStatus("Saving...", "pending");
  setSaving(true);

  try {
    const response = await fetch(`/api/bd-documents/${form.dataset.slug}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "If-Match": revision
      },
      body: JSON.stringify(documentData)
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const savedDocument = await response.json();
    const nextRevision = response.headers.get("etag")?.replace(/^"|"$/g, "");

    if (nextRevision) {
      form.dataset.revision = nextRevision;
    }

    syncChrome(savedDocument);
    setStatus("Saved. Preview is ready.", "success");
    return savedDocument;
  } catch (error) {
    setStatus(messageFromError(error), "error");
    throw error;
  } finally {
    setSaving(false);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await saveDocument();
  } catch {
    // saveDocument has already rendered the actionable error message.
  }
});

form.addEventListener("click", event => {
  const addButton = event.target.closest("[data-add-item]");
  const removeButton = event.target.closest("[data-remove-item]");

  if (addButton) {
    addListItem(addButton.dataset.addItem);
  }

  if (removeButton) {
    removeListItem(removeButton);
  }
});

form.addEventListener("change", async event => {
  const input = event.target.closest("[data-image-input]");

  if (!input) {
    return;
  }

  const item = input.closest("[data-list-item]");
  const file = input.files?.[0];

  if (!item || !file) {
    return;
  }

  try {
    await uploadImage(item, file);
  } catch (error) {
    setAssetMeta(item, messageFromError(error), "error");
    setStatus(messageFromError(error), "error");
  } finally {
    input.value = "";
  }
});

form.addEventListener("input", event => {
  const pathInput = event.target.closest('[data-field="path"], [data-field="assetPath"]');

  if (pathInput) {
    setAssetPreview(pathInput.closest("[data-list-item]"), pathInput.value.trim());
  }

  if (event.target.matches("input[maxlength], textarea[maxlength]")) {
    updateCharacterCounter(event.target);
  }
});

if (previewLink) {
  previewLink.addEventListener("click", async event => {
    event.preventDefault();

    try {
      await saveDocument();
      window.location.assign(previewLink.href);
    } catch {
      // Stay on the form so the user can fix validation or network errors.
    }
  });
}

if (pdfLink) {
  pdfLink.addEventListener("click", async event => {
    event.preventDefault();

    try {
      await saveDocument();
      setStatus("Preparing PDF download...", "pending");
      window.location.assign(pdfLink.href);
    } catch {
      // Stay on the form so the user can fix validation or network errors.
    }
  });
}

window.addEventListener("beforeunload", event => {
  if (status.dataset.state === "pending") {
    event.preventDefault();
  }
});

window.addEventListener("error", event => {
  setStatus(event.message || "Something went wrong.", "error");
});

window.addEventListener("unhandledrejection", event => {
  setStatus(messageFromError(event.reason), "error");
});

initializeCharacterCounters();
