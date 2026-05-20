function messageFromError(error) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function readDownloadErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return body.error || `Download failed with HTTP ${response.status}.`;
  }

  return (await response.text()) || `Download failed with HTTP ${response.status}.`;
}

function filenameFromContentDisposition(value) {
  const utf8Filename = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];

  if (utf8Filename) {
    try {
      return decodeURIComponent(utf8Filename.replace(/^"|"$/g, ""));
    } catch {
      return utf8Filename.replace(/^"|"$/g, "");
    }
  }

  const quotedFilename = value.match(/filename="([^"]+)"/i)?.[1];

  if (quotedFilename) {
    return quotedFilename;
  }

  return value.match(/filename=([^;]+)/i)?.[1]?.trim();
}

function filenameFromLink(link) {
  const explicitDownloadName = link.getAttribute("download");

  if (explicitDownloadName) {
    return explicitDownloadName;
  }

  const url = new URL(link.href, window.location.href);
  const pathnameParts = url.pathname.split("/").filter(Boolean);

  return pathnameParts.at(-1) || "download";
}

function triggerBrowserDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function downloadKind(link) {
  const label = link.textContent.trim();
  const href = link.href.toLowerCase();
  const value = `${label} ${href}`.toLowerCase();

  if (value.includes("excel") || value.includes("xlsx")) return "Excel";
  if (value.includes("word") || value.includes("docx")) return "Word";
  if (value.includes("banner") || value.includes("png")) return "banner";
  if (value.includes("pdf")) return "PDF";
  return label || "file";
}

function defaultStatusTarget(link) {
  return link.closest(".preview-toolbar")?.querySelector("[data-download-status], [data-report-image-status]")
    || document.querySelector("[data-download-status], #save-status, [data-report-order-status]");
}

function defaultSetStatusFor(link) {
  const status = defaultStatusTarget(link);

  return (message, state = "idle") => {
    if (status) {
      status.textContent = message;
      status.dataset.state = state;
      return;
    }

    if (state === "error") {
      window.alert(message);
    }
  };
}

export async function downloadFromLink(link, options = {}) {
  const kind = options.kind || downloadKind(link);
  const setStatus = options.setStatus || defaultSetStatusFor(link);
  const pendingMessage = options.pendingMessage || `Preparing ${kind} download...`;
  const successMessage = options.successMessage || `${kind} download started.`;

  setStatus(pendingMessage, "pending");

  try {
    const response = await fetch(link.href, {
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(await readDownloadErrorMessage(response));
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      throw new Error(await readDownloadErrorMessage(response));
    }

    const blob = await response.blob();
    const filename = filenameFromContentDisposition(response.headers.get("content-disposition") || "")
      || filenameFromLink(link);

    triggerBrowserDownload(blob, filename);
    setStatus(successMessage, "success");
  } catch (error) {
    setStatus(messageFromError(error), "error");
    throw error;
  }
}

export function installExportDownloadHandler() {
  document.addEventListener("click", async event => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('a[download][href^="/api/export/"]');

    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();

    try {
      await downloadFromLink(link);
    } catch {
      // downloadFromLink has already rendered the actionable error message.
    }
  });
}
