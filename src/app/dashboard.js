const importStatus = document.querySelector("[data-dashboard-import-status]");
const ACCEPTED_PDF_TYPES = new Set(["application/pdf", "application/x-pdf"]);
const ACCEPTED_WORD_TYPES = new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_WORD_BYTES = 10 * 1024 * 1024;

function setImportStatus(message, state = "idle") {
  if (!importStatus) {
    return;
  }

  importStatus.textContent = message;
  importStatus.dataset.state = state;
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

function kindLabel(kind) {
  return kind === "bd" ? "business development document" : "case study";
}

function formatLabel(format) {
  return format === "word" ? "Word document" : "PDF";
}

function fileTitle(file) {
  return String(file.name || "Imported document")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Imported document";
}

function slugFromTitle(title, fallback) {
  const slug = String(title || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || fallback;
}

function importEndpoint(kind, format) {
  if (kind === "bd") {
    return format === "word" ? "/api/import/bd/word" : "/api/import/bd/pdf";
  }

  return format === "word" ? "/api/import/word" : "/api/import/pdf";
}

function saveEndpoint(kind, slug) {
  return kind === "bd" ? `/api/bd-documents/${slug}` : `/api/projects/${slug}`;
}

function builderPath(kind, slug) {
  return kind === "bd" ? `/bd-builder/${slug}` : `/builder/${slug}`;
}

function importedPayload(kind, responseBody) {
  return kind === "bd" ? responseBody.document : responseBody.project;
}

function validateImportFile(file, format) {
  if (format === "word") {
    const hasDocxExtension = /\.docx$/i.test(file.name || "");

    if (file.type && !ACCEPTED_WORD_TYPES.has(file.type) && !hasDocxExtension) {
      throw new Error("Unsupported file type. Use a Microsoft Word .docx file.");
    }

    if (file.size > MAX_WORD_BYTES) {
      throw new Error("Word document is too large. Use a .docx file under 10 MB.");
    }

    return;
  }

  const hasPdfExtension = /\.pdf$/i.test(file.name || "");

  if (file.type && !ACCEPTED_PDF_TYPES.has(file.type) && !hasPdfExtension) {
    throw new Error("Unsupported file type. Use a PDF file.");
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF file is too large. Use a file under 20 MB.");
  }
}

async function importSourceFile(kind, format, file) {
  validateImportFile(file, format);

  const response = await fetch(importEndpoint(kind, format), {
    method: "POST",
    headers: {
      "Content-Type": file.type || (format === "word"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf"),
      "X-File-Name": (file.name || `import.${format === "word" ? "docx" : "pdf"}`).replace(/[^\x20-\x7E]/g, "-")
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const body = await response.json();
  const payload = importedPayload(kind, body);

  if (!payload || typeof payload !== "object") {
    throw new Error(`No mappable ${kindLabel(kind)} content was found in that ${formatLabel(format)}.`);
  }

  payload.title = payload.title || fileTitle(file);
  return payload;
}

async function saveImportedDraft(kind, payload, preferredSlug) {
  const stamp = Date.now().toString(36);
  const baseSlug = slugFromTitle(preferredSlug, kind === "bd" ? "imported-business-development-document" : "imported-case-study");

  for (let index = 0; index < 3; index += 1) {
    const slug = `${baseSlug}-${stamp}${index ? `-${index + 1}` : ""}`;
    const response = await fetch(saveEndpoint(kind, slug), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "If-Match": "new"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      return slug;
    }

    if (response.status !== 409) {
      throw new Error(await readErrorMessage(response));
    }
  }

  throw new Error("Could not create a unique draft name for that import.");
}

document.addEventListener("change", async event => {
  const input = event.target.closest("[data-dashboard-import]");

  if (!input) {
    return;
  }

  const file = input.files?.[0];

  if (!file) {
    return;
  }

  const kind = input.dataset.importKind || "project";
  const format = input.dataset.importFormat || "pdf";

  try {
    setImportStatus(`Importing ${file.name || formatLabel(format)} into a ${kindLabel(kind)}...`, "pending");
    const payload = await importSourceFile(kind, format, file);
    setImportStatus("Saving imported draft...", "pending");
    const slug = await saveImportedDraft(kind, payload, payload.title || fileTitle(file));
    setImportStatus("Imported draft saved. Opening it now...", "success");
    window.location.assign(builderPath(kind, slug));
  } catch (error) {
    setImportStatus(messageFromError(error), "error");
  } finally {
    input.value = "";
  }
});
