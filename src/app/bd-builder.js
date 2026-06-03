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
  linesFromText,
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

const form = document.querySelector("#bd-document-form");
const status = document.querySelector("#save-status");
const heading = document.querySelector(".app-header h1");
const previewLink = document.querySelector("[data-preview-link]");
const jsonLink = document.querySelector("[data-json-link]");
const pdfLink = document.querySelector("[data-pdf-link]");
const wordLink = document.querySelector("[data-word-link]");
const bannerLink = document.querySelector("[data-banner-link]");
const pdfImportMeta = document.querySelector("[data-pdf-import-meta]");
const wordImportMeta = document.querySelector("[data-word-import-meta]");

if (!form || !status) {
  throw new Error("Business development builder form could not be initialised.");
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

  if (wordLink) {
    wordLink.href = `/api/export/bd/word/${form.dataset.slug}`;
  }

  if (bannerLink) {
    bannerLink.href = `/api/export/bd/banner/${form.dataset.slug}`;
  }
}

function limitForField(fieldName) {
  return {
    bestFor: FIELD_LIMITS.bestFor,
    description: FIELD_LIMITS.itemDescription,
    evidence: FIELD_LIMITS.evidence,
    intervention: FIELD_LIMITS.intervention,
    outcome: FIELD_LIMITS.outcome,
    problem: FIELD_LIMITS.problem,
    scope: FIELD_LIMITS.scope
  }[fieldName] || FIELD_LIMITS[fieldName] || FIELD_LIMITS.itemDescription;
}

function createField(labelText, fieldName, value = "", multiline = false, maxLength = limitForField(fieldName)) {
  return createFieldControl({
    labelText,
    fieldName,
    value,
    multiline,
    maxLength,
    requestable: !new Set(["projectSlug", "assetPath"]).has(fieldName)
  });
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
      createField("Title", "title", "", false, FIELD_LIMITS.offerTitle),
      createField("Description", "description", "", true, FIELD_LIMITS.offerDescription),
      createField("Deliverables", "deliverables", "", true, FIELD_LIMITS.deliverables)
    );
  } else if (listName === "proofSections") {
    headingText.textContent = "Proof";
    removeButton.setAttribute("aria-label", "Remove proof section");
    grid.append(
      createField("Headline", "headline", "", false, FIELD_LIMITS.headline),
      createField("Client context", "clientContext", "", false, FIELD_LIMITS.clientContext),
      createField("Project slug", "projectSlug", "", false, FIELD_LIMITS.projectSlug),
      createVisibilitySelect("private"),
      createField("Asset path", "assetPath", "", false, FIELD_LIMITS.assetPath),
      createField("Problem", "problem", "", true, FIELD_LIMITS.problem),
      createField("Intervention", "intervention", "", true, FIELD_LIMITS.intervention),
      createField("Outcome", "outcome", "", true, FIELD_LIMITS.outcome),
      createField("Evidence", "evidence", "", true, FIELD_LIMITS.evidence)
    );
  } else if (listName === "engagementModels") {
    headingText.textContent = "Model";
    removeButton.setAttribute("aria-label", "Remove engagement model");
    grid.append(
      createField("Title", "title", "", false, FIELD_LIMITS.engagementTitle),
      createField("Timeline", "timeline", "", false, FIELD_LIMITS.engagementTimeline),
      createField("Best for", "bestFor", "", true, FIELD_LIMITS.bestFor),
      createField("Scope", "scope", "", true, FIELD_LIMITS.scope)
    );
  } else {
    headingText.textContent = "Item";
    removeButton.setAttribute("aria-label", "Remove item");
    grid.append(
      createField("Title", "title", "", false, FIELD_LIMITS.itemTitle),
      createField("Description", "description", "", true, FIELD_LIMITS.itemDescription)
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

function setImagePath(item, path) {
  const pathField = item.querySelector('[data-field="assetPath"]') || item.querySelector('[data-field="path"]');

  if (pathField) {
    pathField.value = path;
    updateCharacterCounter(pathField);
  }

  setAssetPreview(item, path);
}

function setNamedValue(name, nextValue) {
  return setEditorControlValue(form.elements[name], nextValue, { joinArrays: true });
}

function setItemFieldValue(item, fieldName, nextValue) {
  return setEditorControlValue(item.querySelector(`[data-field="${fieldName}"]`), nextValue, { joinArrays: true });
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

    Object.entries(entry || {}).forEach(([fieldName, value]) => {
      setItemFieldValue(item, fieldName, value);
    });

    if (listName === "proofSections" && entry?.assetPath) {
      setAssetPreview(item, entry.assetPath);
    }

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

function applyImportedDocument(documentData) {
  let changed = 0;

  [
    "title",
    "subtitle",
    "year",
    "audience",
    "positioning",
    "executivePromise",
    "processSummary",
    "nextSteps",
    "primaryCta",
    "secondaryCta",
    "confidentialityNotes"
  ].forEach(field => {
    changed += setNamedValue(field, documentData?.[field]) ? 1 : 0;
  });

  changed += replaceListItems("buyerProblems", documentData?.buyerProblems || []);
  changed += replaceListItems("offerPillars", documentData?.offerPillars || []);
  changed += replaceListItems("process", documentData?.process || []);
  changed += replaceListItems("proofSections", documentData?.proofSections || []);
  changed += replaceListItems("engagementModels", documentData?.engagementModels || []);
  changed += applyImportedAssets(documentData?.assets || []);

  if (changed) {
    syncChrome(readDocument());
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
  setImagePath(item, uploaded.path);
  setAssetMeta(item, `Loaded ${dimensions.width}x${dimensions.height} px ${ratioLabel}. Save JSON to keep this image in the document.`, "success");
  setStatus("Image loaded. Save JSON to keep it in the document.", "success");
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

  const response = await fetch("/api/import/bd/pdf", {
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
  const changed = applyImportedDocument(imported.document);
  const pageText = imported.pageCount === 1 ? "1 page" : `${imported.pageCount || "unknown"} pages`;

  if (!changed) {
    throw new Error("No mappable business development content was found in that PDF.");
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

  const response = await fetch("/api/import/bd/word", {
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
  const changed = applyImportedDocument(imported.document);

  if (!changed) {
    throw new Error("No mappable business development content was found in that Word document.");
  }

  setWordImportMeta("Imported Word content. Review the draft, then save JSON.", "success");
  setStatus("Word content imported. Review the draft, then save JSON.", "success");
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
      await downloadFromLink(pdfLink, { setStatus, kind: "PDF" });
    } catch {
      // Stay on the form so the user can fix validation or network errors.
    }
  });
}

if (wordLink) {
  wordLink.addEventListener("click", async event => {
    event.preventDefault();

    try {
      await saveDocument();
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
      await saveDocument();
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
