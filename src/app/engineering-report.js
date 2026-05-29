const imageInput = document.querySelector("[data-report-image-input]");
const imageStatus = document.querySelector("[data-report-image-status]");
const imageGallery = document.querySelector("[data-report-image-gallery]");
const imageGrid = document.querySelector("[data-report-image-grid]");
const imageEmpty = document.querySelector("[data-report-image-empty]");
const spreadsheetInput = document.querySelector("[data-report-spreadsheet-input]");
const spreadsheetList = document.querySelector("[data-report-spreadsheet-list]");
const spreadsheetCount = document.querySelector("[data-report-spreadsheet-count]");
const spreadsheetEmpty = document.querySelector("[data-report-spreadsheet-empty]");
const reportOrderRoot = document.querySelector("[data-report-order-root]");
const reportOrderStatus = document.querySelector("[data-report-order-status]");
const sectionEditor = document.querySelector("[data-section-editor]");
const sectionEditorForm = document.querySelector("[data-section-editor-form]");
const sectionBodyTextarea = sectionEditorForm?.querySelector("textarea[name='body']");
const sectionSaveStatus = document.querySelector("[data-section-save-status]");
const sectionSaveButton = document.querySelector("[data-section-save-button]");
const sectionFormatButtons = document.querySelectorAll("[data-section-format]");
const subsectionEditor = document.querySelector("[data-subsection-editor]");
const subsectionEditorForm = document.querySelector("[data-subsection-editor-form]");
const subsectionBodyTextarea = subsectionEditorForm?.querySelector("textarea[name='body']");
const subsectionSaveStatus = document.querySelector("[data-subsection-save-status]");
const subsectionSaveButton = document.querySelector("[data-subsection-save-button]");
const subsectionFormatButtons = document.querySelectorAll("[data-subsection-format]");
const contributionRequestForm = document.querySelector("[data-contribution-request-form]");
const contributionRequestStatus = document.querySelector("[data-contribution-request-status]");
const contributionRequestResult = document.querySelector("[data-contribution-request-result]");
const contributionRequestButton = document.querySelector("[data-contribution-request-button]");
const ACCEPTED_IMAGE_TYPES = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]);
const ACCEPTED_SPREADSHEET_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv"
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
const IMAGE_GALLERY_COUNT_CLASSES = [
  "report-image-gallery--empty",
  "report-image-gallery--single",
  "report-image-gallery--pair",
  "report-image-gallery--trio",
  "report-image-gallery--quad"
];

function setStatus(message, state = "idle") {
  if (!imageStatus) {
    return;
  }

  imageStatus.textContent = message;
  imageStatus.dataset.state = state;
}

function setSubsectionStatus(message, state = "idle") {
  if (!subsectionSaveStatus) {
    return;
  }

  subsectionSaveStatus.textContent = message;
  subsectionSaveStatus.dataset.state = state;
}

function setSectionStatus(message, state = "idle") {
  if (!sectionSaveStatus) {
    return;
  }

  sectionSaveStatus.textContent = message;
  sectionSaveStatus.dataset.state = state;
}

function setReportOrderStatus(message, state = "idle") {
  if (!reportOrderStatus) {
    return;
  }

  reportOrderStatus.textContent = message;
  reportOrderStatus.dataset.state = state;
}

function setContributionRequestStatus(message, state = "idle") {
  if (!contributionRequestStatus) {
    return;
  }

  contributionRequestStatus.textContent = message;
  contributionRequestStatus.dataset.state = state;
}

function messageFromError(error) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return body.error || `Request failed with HTTP ${response.status}.`;
  }

  return (await response.text()) || `Request failed with HTTP ${response.status}.`;
}

function appendContributionLink(parent, href, label) {
  const link = document.createElement("a");

  link.href = href;
  link.textContent = label;
  link.className = "contribution-request__link";
  parent.append(link);
}

function contributionMarkerDetail(request, state) {
  if (state === "received") {
    return `From ${request.response?.contributorName || request.recipientName || request.recipientEmail}`;
  }

  return `Waiting for ${request.recipientName || request.recipientEmail}`;
}

function syncContributionMarker(request) {
  const pageKind = request.pageKind;
  const pageSlug = request.pageSlug;
  const state = request.response?.body || request.submittedAt ? "received" : "pending";
  const markerSelector = `[data-contribution-marker][data-contribution-page-kind="${pageKind}"][data-contribution-page-slug="${pageSlug}"]`;
  let marker = document.querySelector(markerSelector);

  if (!marker) {
    const firstPageContent = document.querySelector(".case-study-shell .case-page .page-content");
    const heading = firstPageContent?.querySelector("h2");

    if (!firstPageContent || !heading) {
      return;
    }

    marker = document.createElement("div");
    marker.dataset.contributionMarker = "";
    marker.dataset.contributionPageKind = pageKind;
    marker.dataset.contributionPageSlug = pageSlug;
    marker.append(document.createElement("span"), document.createElement("strong"));
    heading.after(marker);
  }

  marker.className = `contribution-marker contribution-marker--${state}`;
  marker.querySelector("span").textContent = state === "received" ? "Response received" : "Response pending";
  marker.querySelector("strong").textContent = contributionMarkerDetail(request, state);
}

function renderContributionRequestResult(data) {
  if (!contributionRequestResult) {
    return;
  }

  const actions = document.createElement("div");
  const responseMeta = document.createElement("p");

  actions.className = "contribution-request__result-actions";
  appendContributionLink(actions, data.mailtoHref, "Open email draft");
  responseMeta.textContent = "The report marker is now pending a reply.";
  responseMeta.className = "contribution-request__result-url";

  contributionRequestResult.replaceChildren(actions, responseMeta);
  contributionRequestResult.hidden = false;
  syncContributionMarker(data.request);
}

function validateImageFile(file) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Use SVG, PNG, JPG or WebP.");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image file is too large. Use a file under 5 MB.");
  }
}

function validateSpreadsheetFile(file) {
  const hasSpreadsheetExtension = /\.(xlsx|xls|csv)$/i.test(file.name || "");

  if (!ACCEPTED_SPREADSHEET_TYPES.has(file.type) && !hasSpreadsheetExtension) {
    throw new Error("Unsupported spreadsheet type. Use XLSX, XLS or CSV.");
  }

  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new Error("Spreadsheet file is too large. Use a file under 10 MB.");
  }
}

function looksLikeImageFilename(value) {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(String(value || "").trim());
}

function imageCaptionText(image) {
  const caption = String(image?.caption || "").trim();

  return caption && !looksLikeImageFilename(caption) ? caption : "";
}

function imageCopyrightText(image) {
  return String(image?.copyright || image?.credit || image?.rights || "").trim();
}

function appendImageCaption(figure, image) {
  const captionText = imageCaptionText(image);
  const copyrightText = imageCopyrightText(image);

  if (!captionText && !copyrightText) {
    return;
  }

  const caption = document.createElement("figcaption");

  if (captionText) {
    const captionLine = document.createElement("span");
    captionLine.textContent = captionText;
    caption.append(captionLine);
  }

  if (copyrightText) {
    const copyrightLine = document.createElement("small");
    copyrightLine.textContent = copyrightText;
    caption.append(copyrightLine);
  }

  figure.append(caption);
}

function imageGalleryCountClass(count) {
  if (count <= 0) return "report-image-gallery--empty";
  if (count === 1) return "report-image-gallery--single";
  if (count === 2) return "report-image-gallery--pair";
  if (count === 3) return "report-image-gallery--trio";
  return "report-image-gallery--quad";
}

function renderImage(image) {
  const figure = document.createElement("figure");
  const img = document.createElement("img");
  const captionText = imageCaptionText(image);

  figure.className = "report-image-card";
  img.src = image.path;
  img.alt = captionText || "Engineering report visual";
  figure.append(img);
  appendImageCaption(figure, image);

  return figure;
}

function renderSpreadsheet(spreadsheet) {
  const link = document.createElement("a");
  const label = document.createElement("span");
  const fileName = document.createElement("strong");

  link.className = "report-spreadsheet-card";
  link.href = spreadsheet.path;
  link.download = "";
  label.textContent = spreadsheet.caption || spreadsheet.fileName || "Spreadsheet attachment";
  fileName.textContent = spreadsheet.fileName || "Download";
  link.append(label, fileName);

  return link;
}

function syncGallery(images) {
  if (!imageGallery || !imageGrid) {
    return;
  }

  imageGrid.replaceChildren(...images.map(renderImage));
  imageGallery.classList.remove(...IMAGE_GALLERY_COUNT_CLASSES);
  imageGallery.classList.add(imageGalleryCountClass(images.length));

  if (imageEmpty) {
    imageEmpty.hidden = images.length > 0;
  }
}

function syncSpreadsheets(spreadsheets) {
  if (!spreadsheetList) {
    return;
  }

  const grid = spreadsheetList.querySelector(".report-spreadsheet-grid");

  if (grid) {
    grid.replaceChildren(...spreadsheets.map(renderSpreadsheet));
  }

  spreadsheetList.classList.toggle("report-spreadsheet-list--empty", spreadsheets.length === 0);

  if (spreadsheetCount) {
    spreadsheetCount.textContent = String(spreadsheets.length);
  }

  if (spreadsheetEmpty) {
    spreadsheetEmpty.hidden = spreadsheets.length > 0;
  }
}

async function uploadImage(file) {
  validateImageFile(file);

  const reportSlug = imageInput.dataset.reportSlug;
  const pageKind = imageInput.dataset.pageKind;
  const pageSlug = imageInput.dataset.pageSlug;
  const response = await fetch(`/api/engineering-report-images/${reportSlug}/${pageKind}/${pageSlug}`, {
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

  return response.json();
}

async function uploadSpreadsheet(file) {
  validateSpreadsheetFile(file);

  const reportSlug = spreadsheetInput.dataset.reportSlug;
  const sectionSlug = spreadsheetInput.dataset.sectionSlug;
  const response = await fetch(`/api/engineering-report-spreadsheets/${reportSlug}/${sectionSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": file.name.replace(/[^\x20-\x7E]/g, "-")
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

if (imageInput) {
  imageInput.addEventListener("change", async () => {
    const files = Array.from(imageInput.files || []);

    if (!files.length) {
      return;
    }

    try {
      let latestImages = [];

      for (const [index, file] of files.entries()) {
        setStatus(`Uploading ${index + 1}/${files.length}: ${file.name} (${formatFileSize(file.size)})`, "pending");
        const uploaded = await uploadImage(file);
        latestImages = uploaded.images || [];
      }

      syncGallery(latestImages);
      setStatus(`${files.length} ${files.length === 1 ? "image" : "images"} added.`, "success");
    } catch (error) {
      setStatus(messageFromError(error), "error");
    } finally {
      imageInput.value = "";
    }
  });
}

if (spreadsheetInput) {
  spreadsheetInput.addEventListener("change", async () => {
    const files = Array.from(spreadsheetInput.files || []);

    if (!files.length) {
      return;
    }

    try {
      let latestSpreadsheets = [];

      for (const [index, file] of files.entries()) {
        setStatus(`Uploading spreadsheet ${index + 1}/${files.length}: ${file.name} (${formatFileSize(file.size)})`, "pending");
        const uploaded = await uploadSpreadsheet(file);
        latestSpreadsheets = uploaded.spreadsheets || [];
      }

      syncSpreadsheets(latestSpreadsheets);
      setStatus(`${files.length} ${files.length === 1 ? "spreadsheet" : "spreadsheets"} added.`, "success");
    } catch (error) {
      setStatus(messageFromError(error), "error");
    } finally {
      spreadsheetInput.value = "";
    }
  });
}

function orderItemScope(item) {
  if (!item) {
    return null;
  }

  if (item.dataset.reportOrderItem === "chapter") {
    return item.closest("[data-report-chapter-list]");
  }

  return item.closest("[data-report-subsection-list]");
}

function reportOrderItems(container, kind) {
  return Array.from(container?.children || []).filter(item => item.dataset.reportOrderItem === kind);
}

function reportOrderPayload() {
  const chapterList = reportOrderRoot.querySelector("[data-report-chapter-list]");
  const subsectionsBySectionSlug = {};

  reportOrderRoot.querySelectorAll("[data-report-subsection-list]").forEach(list => {
    subsectionsBySectionSlug[list.dataset.sectionSlug] = reportOrderItems(list, "subsection")
      .map(item => item.dataset.subsectionSlug);
  });

  return {
    groupSlugs: reportOrderItems(chapterList, "chapter").map(item => item.dataset.groupSlug),
    subsectionsBySectionSlug
  };
}

function syncChapterOrderDisplay() {
  const chapterList = reportOrderRoot.querySelector("[data-report-chapter-list]");
  const anchorList = reportOrderRoot.querySelector(".report-anchor-list");
  const chapterItems = reportOrderItems(chapterList, "chapter");

  chapterItems.forEach((item, index) => {
    const indexLabel = item.querySelector("[data-report-chapter-index]");

    if (indexLabel) {
      indexLabel.textContent = String(index + 1).padStart(2, "0");
    }
  });

  if (anchorList) {
    chapterItems.forEach(item => {
      const anchor = anchorList.querySelector(`a[href="#${item.id}"]`);

      if (anchor) {
        anchorList.append(anchor);
      }
    });
  }
}

async function saveReportOrder() {
  const reportSlug = reportOrderRoot.dataset.reportSlug;

  setReportOrderStatus("Saving...", "pending");

  const response = await fetch(`/api/engineering-report-order/${reportSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(reportOrderPayload())
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  setReportOrderStatus("Order saved.", "success");
}

if (reportOrderRoot) {
  let draggedItem = null;
  let reportOrderChanged = false;

  reportOrderRoot.addEventListener("click", event => {
    if (event.target.closest("[data-reorder-handle]")) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  reportOrderRoot.addEventListener("dragstart", event => {
    const handle = event.target.closest("[data-reorder-handle]");
    const item = handle?.closest("[data-report-order-item]");

    if (!item) {
      event.preventDefault();
      return;
    }

    draggedItem = item;
    reportOrderChanged = false;
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.dataset.groupSlug || item.dataset.subsectionSlug || "");
  });

  reportOrderRoot.addEventListener("dragover", event => {
    if (!draggedItem) {
      return;
    }

    const targetItem = event.target.closest("[data-report-order-item]");

    if (!targetItem || targetItem === draggedItem || targetItem.dataset.reportOrderItem !== draggedItem.dataset.reportOrderItem) {
      return;
    }

    const draggedScope = orderItemScope(draggedItem);

    if (!draggedScope || orderItemScope(targetItem) !== draggedScope) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    reportOrderRoot.querySelectorAll(".is-drop-target").forEach(item => item.classList.remove("is-drop-target"));
    targetItem.classList.add("is-drop-target");

    const targetRect = targetItem.getBoundingClientRect();
    const shouldMoveAfter = event.clientY > targetRect.top + targetRect.height / 2;
    const referenceItem = shouldMoveAfter ? targetItem.nextElementSibling : targetItem;

    if (referenceItem !== draggedItem) {
      draggedScope.insertBefore(draggedItem, referenceItem);
      reportOrderChanged = true;
      syncChapterOrderDisplay();
    }
  });

  reportOrderRoot.addEventListener("drop", event => {
    if (draggedItem) {
      event.preventDefault();
    }
  });

  reportOrderRoot.addEventListener("dragend", async () => {
    reportOrderRoot.querySelectorAll(".is-dragging, .is-drop-target").forEach(item => {
      item.classList.remove("is-dragging", "is-drop-target");
    });
    draggedItem = null;

    if (!reportOrderChanged) {
      return;
    }

    reportOrderChanged = false;

    try {
      await saveReportOrder();
    } catch (error) {
      setReportOrderStatus(messageFromError(error), "error");
    }
  });
}

async function saveSubsectionDraft(form) {
  const reportSlug = subsectionEditor.dataset.reportSlug;
  const subsectionSlug = subsectionEditor.dataset.subsectionSlug;
  const body = new FormData(form);
  const response = await fetch(`/api/engineering-report-subsections/${reportSlug}/${subsectionSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      owner: body.get("owner"),
      status: body.get("status"),
      body: body.get("body")
    })
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

async function saveSectionDraft(form) {
  const reportSlug = sectionEditor.dataset.reportSlug;
  const sectionSlug = sectionEditor.dataset.sectionSlug;
  const body = new FormData(form);
  const response = await fetch(`/api/engineering-report-sections/${reportSlug}/${sectionSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      body: body.get("body")
    })
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

async function prepareContributionRequest(form) {
  const fields = new FormData(form);
  const response = await fetch("/api/engineering-report-contribution-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      reportSlug: fields.get("reportSlug"),
      pageKind: fields.get("pageKind"),
      pageSlug: fields.get("pageSlug"),
      recipientEmail: fields.get("recipientEmail"),
      recipientName: fields.get("recipientName"),
      message: fields.get("message")
    })
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

if (contributionRequestForm) {
  contributionRequestForm.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      if (contributionRequestButton) {
        contributionRequestButton.disabled = true;
      }

      setContributionRequestStatus("Preparing...", "pending");
      renderContributionRequestResult(await prepareContributionRequest(contributionRequestForm));
      setContributionRequestStatus("Request ready.", "success");
    } catch (error) {
      setContributionRequestStatus(messageFromError(error), "error");
    } finally {
      if (contributionRequestButton) {
        contributionRequestButton.disabled = false;
      }
    }
  });
}

function markDraftChanged(textarea) {
  textarea.dispatchEvent(new Event("input", {
    bubbles: true
  }));
}

function replaceTextareaRange(textarea, start, end, replacement, selectionStart, selectionEnd) {
  const value = textarea.value;

  textarea.value = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  textarea.focus();
  textarea.setSelectionRange(selectionStart, selectionEnd);
  markDraftChanged(textarea);
}

function applyInlineFormat(textarea, marker) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.slice(start, end);
  const replacement = selectedText ? `${marker}${selectedText}${marker}` : `${marker}${marker}`;
  const innerStart = start + marker.length;
  const innerEnd = innerStart + selectedText.length;

  replaceTextareaRange(textarea, start, end, replacement, innerStart, innerEnd);
}

function applyHeadingFormat(textarea, level) {
  const marker = `${"#".repeat(level)} `;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lastSelectedIndex = Math.max(start, end - 1);
  const nextLineBreak = value.indexOf("\n", lastSelectedIndex);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const selectedLines = value.slice(lineStart, lineEnd);
  const replacement = selectedLines
    ? selectedLines.split("\n").map(line => line.trim() ? `${marker}${line.replace(/^\s*#{1,6}\s+/, "")}` : line).join("\n")
    : marker;

  replaceTextareaRange(textarea, lineStart, lineEnd, replacement, lineStart, lineStart + replacement.length);
}

function bindFormatToolbar(buttons, textarea, formatDatasetKey) {
  if (!buttons.length || !textarea) {
    return;
  }

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const format = button.dataset[formatDatasetKey];

      if (format === "heading") {
        applyHeadingFormat(textarea, Number(button.dataset.headingLevel) || 3);
        return;
      }

      if (format === "bold") {
        applyInlineFormat(textarea, "**");
        return;
      }

      if (format === "italic") {
        applyInlineFormat(textarea, "*");
      }
    });
  });
}

function bindDraftForm({ form, editor, saveButton, saveDraft, setSaveStatus }) {
  if (!form || !editor) {
    return;
  }

  form.addEventListener("input", () => {
    setSaveStatus("Unsaved changes", "dirty");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      if (saveButton) {
        saveButton.disabled = true;
      }
      setSaveStatus("Saving...", "pending");
      await saveDraft(form);
      setSaveStatus("Saved. Refreshing...", "success");
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      setSaveStatus(messageFromError(error), "error");
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
      }
    }
  });
}

bindFormatToolbar(sectionFormatButtons, sectionBodyTextarea, "sectionFormat");
bindFormatToolbar(subsectionFormatButtons, subsectionBodyTextarea, "subsectionFormat");
bindDraftForm({
  editor: sectionEditor,
  form: sectionEditorForm,
  saveButton: sectionSaveButton,
  saveDraft: saveSectionDraft,
  setSaveStatus: setSectionStatus
});
bindDraftForm({
  editor: subsectionEditor,
  form: subsectionEditorForm,
  saveButton: subsectionSaveButton,
  saveDraft: saveSubsectionDraft,
  setSaveStatus: setSubsectionStatus
});
