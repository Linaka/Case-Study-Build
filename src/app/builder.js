import { downloadFromLink } from "./export-downloads.js";
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_PDF_TYPES,
  ACCEPTED_WORD_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_WORD_BYTES,
  createAssetLoader,
  createFieldControl,
  createVisibilitySelect,
  fieldLimitsFromForm,
  fieldValue,
  formatFileSize,
  imageRatioLabel,
  initializeCharacterCounters,
  linesFromForm,
  messageFromError,
  readErrorMessage,
  setAssetPreview,
  setControlValue as setEditorControlValue,
  setMeta,
  setSaving as setEditorSaving,
  setStatus as setEditorStatus,
  updateCharacterCounter,
  valueFromForm
} from "./editor-core.js";

const form = document.querySelector("#project-form");
const status = document.querySelector("#save-status");
const heading = document.querySelector(".app-header h1");
const previewLink = document.querySelector("[data-preview-link]");
const jsonLink = document.querySelector("[data-json-link]");
const pdfLink = document.querySelector("[data-pdf-link]");
const xlsxLink = document.querySelector("[data-xlsx-link]");
const wordLink = document.querySelector("[data-word-link]");
const bannerLink = document.querySelector("[data-banner-link]");
const pdfImportMeta = document.querySelector("[data-pdf-import-meta]");
const wordImportMeta = document.querySelector("[data-word-import-meta]");

if (!form || !status) {
  throw new Error("Builder form could not be initialised.");
}

const FIELD_LIMITS = fieldLimitsFromForm(form);

function value(name) {
  return valueFromForm(form, name);
}

function lines(name) {
  return linesFromForm(form, name);
}

function setStatus(message, state = "idle") {
  setEditorStatus(status, message, state);
}

function setPdfImportMeta(message, state = "idle") {
  setMeta(pdfImportMeta, message, state);
}

function setWordImportMeta(message, state = "idle") {
  setMeta(wordImportMeta, message, state);
}

function setSaving(isSaving) {
  setEditorSaving(form, isSaving);
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

  if (xlsxLink) {
    xlsxLink.href = `/api/export/xlsx/${form.dataset.slug}`;
  }

  if (wordLink) {
    wordLink.href = `/api/export/word/${form.dataset.slug}`;
  }

  if (bannerLink) {
    bannerLink.href = `/api/export/banner/${form.dataset.slug}`;
  }
}

function limitForField(fieldName) {
  return {
    caption: FIELD_LIMITS.assetCaption,
    description: FIELD_LIMITS.itemDescription,
    metric: FIELD_LIMITS.impactMetric,
    path: FIELD_LIMITS.assetPath,
    title: FIELD_LIMITS.itemTitle,
    unit: FIELD_LIMITS.impactUnit
  }[fieldName] || FIELD_LIMITS[fieldName] || FIELD_LIMITS.itemDescription;
}

function createField(labelText, fieldName, value = "", multiline = false, maxLength = limitForField(fieldName), type = "text") {
  return createFieldControl({
    labelText,
    fieldName,
    value,
    multiline,
    maxLength,
    type,
    requestable: fieldName !== "path" && type !== "number"
  });
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
      ...(listName === "impact" ? [
        createField("Value", "value", "", false, FIELD_LIMITS.itemDescription, "number"),
        createField("Unit", "unit", "", false, FIELD_LIMITS.impactUnit)
      ] : []),
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

  const itemCount = listEditor.querySelectorAll("[data-list-item]").length;
  const summaryCount = listEditor.querySelector(".list-editor__summary span");

  if (summaryCount) {
    summaryCount.textContent = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  }
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

function setAssetMeta(item, message, state = "idle") {
  setMeta(item.querySelector("[data-image-meta]"), message, state);
}

function setAssetPath(item, path) {
  const pathField = item.querySelector('[data-field="path"]');

  if (pathField) {
    pathField.value = path;
    updateCharacterCounter(pathField);
  }

  setAssetPreview(item, path);
}

function setNamedValue(name, nextValue) {
  return setEditorControlValue(form.elements[name], nextValue);
}

function setItemFieldValue(item, fieldName, nextValue) {
  return setEditorControlValue(item.querySelector(`[data-field="${fieldName}"]`), nextValue);
}

function replaceListItems(listName, entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return 0;
  }

  const listEditor = form.querySelector(`[data-list="${listName}"]`);
  const items = listEditor?.querySelector("[data-list-items]");

  if (!listEditor || !items) {
    return 0;
  }

  items.replaceChildren();

  entries.forEach(entry => {
    const item = createListItem(listName);

    if (listName === "impact") {
      setItemFieldValue(item, "metric", entry.metric);
      setItemFieldValue(item, "value", entry.value);
      setItemFieldValue(item, "unit", entry.unit);
    } else {
      setItemFieldValue(item, "title", entry.title);
    }

    setItemFieldValue(item, "description", entry.description);
    items.append(item);
  });

  updateListLabels(listEditor);
  return entries.length;
}

function applyImportedAssets(assets) {
  if (!Array.isArray(assets) || !assets.length) {
    return 0;
  }

  let changed = 0;

  assets.forEach(asset => {
    const slot = asset?.slot || "cover";
    const item = form.querySelector(`[data-asset-slot="${slot}"]`) || form.querySelector("[data-asset-slot]");

    if (!item) {
      return;
    }

    changed += setItemFieldValue(item, "path", asset.path) ? 1 : 0;
    changed += setItemFieldValue(item, "caption", asset.caption) ? 1 : 0;
    changed += setItemFieldValue(item, "visibility", asset.visibility) ? 1 : 0;

    if (asset.path) {
      setAssetPreview(item, asset.path);
    }
  });

  return changed;
}

function applyImportedProject(project) {
  let changed = 0;

  [
    "title",
    "subtitle",
    "year",
    "sector",
    "clientType",
    "role",
    "context",
    "challenge",
    "audience",
    "approach",
    "reflection",
    "confidentialityNotes"
  ].forEach(field => {
    changed += setNamedValue(field, project?.[field]) ? 1 : 0;
  });

  if (Array.isArray(project?.collaborators) && project.collaborators.length) {
    changed += setNamedValue("collaborators", project.collaborators.join("\n")) ? 1 : 0;
  }

  changed += replaceListItems("keyDecisions", project?.keyDecisions || []);
  changed += replaceListItems("outputs", project?.outputs || []);
  changed += replaceListItems("impact", project?.impact || []);
  changed += applyImportedAssets(project?.assets || []);

  if (changed) {
    syncChrome(readProject());
  }

  return changed;
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

function validatePdfFile(file) {
  const hasPdfExtension = /\.pdf$/i.test(file.name || "");

  if (file.type && !ACCEPTED_PDF_TYPES.has(file.type) && !hasPdfExtension) {
    throw new Error("Unsupported file type. Use a PDF file.");
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF file is too large. Use a file under 20 MB.");
  }
}

async function importPdf(file) {
  validatePdfFile(file);
  setPdfImportMeta(`Importing ${file.name || "PDF"}...`, "pending");
  setStatus("Importing PDF content...", "pending");

  const response = await fetch("/api/import/pdf", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/pdf",
      "X-File-Name": (file.name || "import.pdf").replace(/[^\x20-\x7E]/g, "-")
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const imported = await response.json();
  const changed = applyImportedProject(imported.project);
  const pageText = imported.pageCount === 1 ? "1 page" : `${imported.pageCount || "unknown"} pages`;

  if (!changed) {
    throw new Error("No mappable case-study content was found in that PDF.");
  }

  setPdfImportMeta(`Imported ${pageText}. Review the draft, then save JSON.`, "success");
  setStatus("PDF content imported. Review the draft, then save JSON.", "success");
}

function validateWordFile(file) {
  const hasDocxExtension = /\.docx$/i.test(file.name || "");

  if (file.type && !ACCEPTED_WORD_TYPES.has(file.type) && !hasDocxExtension) {
    throw new Error("Unsupported file type. Use a Microsoft Word .docx file.");
  }

  if (file.size > MAX_WORD_BYTES) {
    throw new Error("Word document is too large. Use a .docx file under 10 MB.");
  }
}

async function importWord(file) {
  validateWordFile(file);
  setWordImportMeta(`Importing ${file.name || "Word document"}...`, "pending");
  setStatus("Importing Word content...", "pending");

  const response = await fetch("/api/import/word", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "X-File-Name": (file.name || "import.docx").replace(/[^\x20-\x7E]/g, "-")
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const imported = await response.json();
  const changed = applyImportedProject(imported.project);

  if (!changed) {
    throw new Error("No mappable case-study content was found in that Word document.");
  }

  setWordImportMeta("Imported Word content. Review the draft, then save JSON.", "success");
  setStatus("Word content imported. Review the draft, then save JSON.", "success");
}

function collectStructuredList(listName) {
  return Array.from(form.querySelectorAll(`[data-list="${listName}"] [data-list-item]`))
    .map(item => {
      if (listName === "impact") {
        const impact = {
          metric: fieldValue(item, "metric"),
          value: fieldValue(item, "value"),
          unit: fieldValue(item, "unit"),
          description: fieldValue(item, "description")
        };

        return impact.metric || impact.value || impact.unit || impact.description ? impact : null;
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

document.addEventListener("change", async event => {
  const pdfInput = event.target.closest("[data-pdf-import-input]");

  if (pdfInput) {
    const file = pdfInput.files?.[0];

    if (!file) {
      return;
    }

    try {
      await importPdf(file);
    } catch (error) {
      setPdfImportMeta(messageFromError(error), "error");
      setStatus(messageFromError(error), "error");
    } finally {
      pdfInput.value = "";
    }

    return;
  }

  const wordInput = event.target.closest("[data-word-import-input]");

  if (wordInput) {
    const file = wordInput.files?.[0];

    if (!file) {
      return;
    }

    try {
      await importWord(file);
    } catch (error) {
      setWordImportMeta(messageFromError(error), "error");
      setStatus(messageFromError(error), "error");
    } finally {
      wordInput.value = "";
    }

    return;
  }

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
      await downloadFromLink(pdfLink, { setStatus, kind: "PDF" });
    } catch {
      // Stay on the form so the user can fix validation or network errors.
    }
  });
}

if (xlsxLink) {
  xlsxLink.addEventListener("click", async event => {
    event.preventDefault();

    try {
      await saveProject();
      await downloadFromLink(xlsxLink, { setStatus, kind: "Excel" });
    } catch {
      // Stay on the form so the user can fix validation or network errors.
    }
  });
}

if (wordLink) {
  wordLink.addEventListener("click", async event => {
    event.preventDefault();

    try {
      await saveProject();
      await downloadFromLink(wordLink, { setStatus, kind: "Word" });
    } catch {
      // Stay on the form so the user can fix validation or network errors.
    }
  });
}

if (bannerLink) {
  bannerLink.addEventListener("click", async event => {
    event.preventDefault();

    try {
      await saveProject();
      await downloadFromLink(bannerLink, { setStatus, kind: "banner" });
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

initializeCharacterCounters(form);
