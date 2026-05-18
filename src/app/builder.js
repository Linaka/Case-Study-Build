const form = document.querySelector("#project-form");
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
  sector: 56,
  clientType: 64,
  role: 110,
  collaborators: 360,
  context: 650,
  challenge: 520,
  audience: 420,
  approach: 560,
  reflection: 420,
  confidentialityNotes: 320,
  itemTitle: 72,
  itemDescription: 210,
  impactMetric: 56,
  assetPath: 300,
  assetCaption: 140
};

if (!form || !status) {
  throw new Error("Builder form could not be initialised.");
}

function value(name) {
  const control = form.elements[name];

  if (!control) {
    throw new Error(`Missing form field: ${name}`);
  }

  return control.value.trim();
}

function lines(name) {
  return value(name).split(/\n+/).map(item => item.trim()).filter(Boolean);
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

function syncChrome(project) {
  if (heading) {
    heading.textContent = project.title || "Untitled case study";
  }

  document.title = `Edit ${project.title || "Untitled case study"}`;

  if (previewLink) {
    previewLink.href = `/projects/${form.dataset.slug}`;
  }

  if (jsonLink) {
    jsonLink.href = `/api/projects/${form.dataset.slug}`;
  }

  if (pdfLink) {
    pdfLink.href = `/api/export/pdf/${form.dataset.slug}`;
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
    caption: FIELD_LIMITS.assetCaption,
    description: FIELD_LIMITS.itemDescription,
    metric: FIELD_LIMITS.impactMetric,
    path: FIELD_LIMITS.assetPath,
    title: FIELD_LIMITS.itemTitle
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

function createVisibilitySelect(value = "public") {
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
  const heading = document.createElement("h4");
  const removeButton = document.createElement("button");
  const grid = document.createElement("div");

  item.className = "list-item";
  item.dataset.listItem = "";
  header.className = "list-item__header";
  removeButton.className = "icon-button";
  removeButton.type = "button";
  removeButton.dataset.removeItem = "";
  removeButton.textContent = "Remove";
  grid.className = "field-grid field-grid--item";

  if (listName === "assets") {
    heading.textContent = "Asset";
    removeButton.setAttribute("aria-label", "Remove asset");
    grid.append(
      createField("Image path", "path"),
      createVisibilitySelect(),
      createField("Caption", "caption", "", true, FIELD_LIMITS.assetCaption)
    );
  } else {
    const titleField = listName === "impact" ? "metric" : "title";
    const titleLabel = listName === "impact" ? "Metric" : "Title";

    heading.textContent = "Item";
    removeButton.setAttribute("aria-label", "Remove item");
    grid.append(
      createField(titleLabel, titleField),
      createField("Description", "description", "", true, FIELD_LIMITS.itemDescription)
    );
  }

  header.append(heading, removeButton);
  item.append(header);

  if (listName === "assets") {
    item.append(createAssetLoader());
  }

  item.append(grid);
  return item;
}

function updateListLabels(listEditor) {
  const listName = listEditor.dataset.list;

  listEditor.querySelectorAll("[data-list-item]").forEach((item, index) => {
    const heading = item.querySelector("h4");
    if (!heading) {
      return;
    }

    heading.textContent = `${listName === "assets" ? "Asset" : "Item"} ${index + 1}`;
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

function setAssetPath(item, path) {
  const pathField = item.querySelector('[data-field="path"]');

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
  setAssetPath(item, uploaded.path);
  setAssetMeta(item, `Loaded ${dimensions.width}x${dimensions.height} px ${ratioLabel}. Save JSON to keep this image in the case study.`, "success");
  setStatus("Image loaded. Save JSON to keep it in the case study.", "success");
}

function collectStructuredList(listName) {
  return Array.from(form.querySelectorAll(`[data-list="${listName}"] [data-list-item]`))
    .map(item => {
      if (listName === "impact") {
        const impact = {
          metric: fieldValue(item, "metric"),
          description: fieldValue(item, "description")
        };

        return impact.metric || impact.description ? impact : null;
      }

      const entry = {
        title: fieldValue(item, "title"),
        description: fieldValue(item, "description")
      };

      return entry.title || entry.description ? entry : null;
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

function readProject() {
  return {
    title: value("title"),
    subtitle: value("subtitle"),
    year: value("year"),
    sector: value("sector"),
    clientType: value("clientType"),
    role: value("role"),
    collaborators: lines("collaborators"),
    context: value("context"),
    challenge: value("challenge"),
    audience: value("audience"),
    approach: value("approach"),
    keyDecisions: collectStructuredList("keyDecisions"),
    outputs: collectStructuredList("outputs"),
    impact: collectStructuredList("impact"),
    reflection: value("reflection"),
    confidentialityNotes: value("confidentialityNotes"),
    assets: collectAssets()
  };
}

async function saveProject() {
  const project = readProject();
  const revision = form.dataset.revision || "new";

  setStatus("Saving...", "pending");
  setSaving(true);

  try {
    const response = await fetch(`/api/projects/${form.dataset.slug}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "If-Match": revision
      },
      body: JSON.stringify(project)
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const savedProject = await response.json();
    const nextRevision = response.headers.get("etag")?.replace(/^"|"$/g, "");

    if (nextRevision) {
      form.dataset.revision = nextRevision;
    }

    syncChrome(savedProject);
    setStatus("Saved. Preview is ready.", "success");
    return savedProject;
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
    await saveProject();
  } catch {
    // saveProject has already rendered the actionable error message.
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
  const pathInput = event.target.closest('[data-asset-slot] [data-field="path"]');

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
      await saveProject();
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
      await saveProject();
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
