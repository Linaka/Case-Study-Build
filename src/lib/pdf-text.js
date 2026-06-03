import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parsePdf = require("pdf-parse/lib/pdf-parse.js");

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

const PDF_CONTENT_TYPES = new Set(["application/pdf", "application/x-pdf", "application/octet-stream"]);

function pdfImportError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asText(value) {
  return String(value ?? "").trim();
}

export function cleanPdfText(text) {
  return asText(text)
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function usablePdfTitle(title) {
  const text = asText(title);

  if (!text || /^about:blank$/i.test(text)) {
    return "";
  }

  return text;
}

export function assertPdfUpload(file, contentType) {
  const normalizedType = String(contentType || "").split(";")[0].trim().toLowerCase();

  if (normalizedType && !PDF_CONTENT_TYPES.has(normalizedType)) {
    throw pdfImportError("Unsupported file type. Use a PDF file.", 415);
  }

  if (!file.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw pdfImportError("PDF import does not look like a valid PDF file.", 415);
  }
}

export async function extractPdfText(file) {
  const parsed = await parsePdf(file);
  const text = cleanPdfText(parsed.text || "");

  if (!text) {
    throw pdfImportError("PDF text could not be read. Use a text-based PDF rather than a scanned image.", 422);
  }

  return {
    text,
    pageCount: Number(parsed.numpages || 0),
    title: usablePdfTitle(parsed.info?.Title)
  };
}
