import fs from "node:fs/promises";
import path from "node:path";

import { assertImageSignature, MAX_IMAGE_BYTES, safeAssetFilename } from "../lib/assets.js";
import { backupWrittenFile } from "../lib/backups.js";
import {
  addEngineeringReportImage,
  addEngineeringReportSpreadsheet,
  assertEngineeringReportPageKind,
  assertEngineeringReportSlug,
  findEngineeringReportSection,
  findEngineeringReportSubsection,
  readEngineeringReport
} from "../lib/engineering-reports.js";
import { assertPdfUpload, importBdDocumentPdf, importProjectPdf, MAX_PDF_BYTES } from "../lib/pdf-import.js";
import {
  bdDocumentFromDocx,
  isDocxBuffer,
  MAX_WORD_DOCUMENT_BYTES,
  projectFromDocx
} from "../lib/word-documents.js";
import { httpError } from "./http.js";
import { readBinaryRequest } from "./request-body.js";

const SPREADSHEET_TYPES = new Map([
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.ms-excel", ".xls"],
  ["text/csv", ".csv"],
  ["application/csv", ".csv"]
]);
const SPREADSHEET_EXTENSIONS = new Map([
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".xls", "application/vnd.ms-excel"],
  [".csv", "text/csv"]
]);
const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

function spreadsheetContentType(originalName, contentType) {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();

  if (SPREADSHEET_TYPES.has(normalized)) {
    return normalized;
  }

  const extension = path.extname(String(originalName || "")).toLowerCase();
  return SPREADSHEET_EXTENSIONS.get(extension) || normalized;
}

function safeSpreadsheetFilename(fileName, contentType, now = Date.now()) {
  const parsed = path.parse(String(fileName || "engineering-report-spreadsheet"));
  const baseName = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "engineering-report-spreadsheet";
  const expectedExtension = SPREADSHEET_TYPES.get(contentType);

  if (!expectedExtension) {
    throw httpError(415, "Unsupported spreadsheet type. Use XLSX, XLS or CSV.");
  }

  return `${baseName}-${now}${expectedExtension}`;
}

function assertSpreadsheetSignature(file, contentType) {
  if (contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    if (file.subarray(0, 2).toString("ascii") !== "PK") {
      throw httpError(415, "XLSX upload does not look like a valid spreadsheet file.");
    }
    return;
  }

  if (contentType === "application/vnd.ms-excel") {
    const oleSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (!file.subarray(0, 8).equals(oleSignature)) {
      throw httpError(415, "XLS upload does not look like a valid spreadsheet file.");
    }
    return;
  }

  if (contentType === "text/csv" || contentType === "application/csv") {
    if (file.includes(0)) {
      throw httpError(415, "CSV upload appears to contain binary data.");
    }
    return;
  }

  throw httpError(415, "Unsupported spreadsheet type. Use XLSX, XLS or CSV.");
}

async function readWordDocumentRequest(request) {
  const file = await readBinaryRequest(
    request,
    MAX_WORD_DOCUMENT_BYTES,
    "Word document is too large. Use a .docx file under 10 MB."
  );

  if (!file.length) {
    throw httpError(400, "Choose a .docx file before importing.");
  }

  if (!isDocxBuffer(file)) {
    throw httpError(400, "Import requires a Microsoft Word .docx file.");
  }

  return file;
}

export function createUploadService({ root }) {
  return {
    async uploadAsset(request, slug) {
      const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const originalName = request.headers["x-file-name"];
      const fileName = safeAssetFilename(originalName, contentType);
      const file = await readBinaryRequest(request, MAX_IMAGE_BYTES, "Image file is too large. Use a file under 5 MB.");

      if (!file.length) {
        throw httpError(400, "Choose an image file before uploading.");
      }

      assertImageSignature(file, contentType);

      const assetDir = path.join(root, "public/assets/projects", slug);
      const filePath = path.join(assetDir, fileName);

      await fs.mkdir(assetDir, { recursive: true });
      await fs.writeFile(filePath, file);
      await backupWrittenFile(filePath, path.join("public/assets/projects", slug, fileName));

      return {
        path: `/assets/projects/${slug}/${fileName}`,
        fileName,
        type: contentType,
        size: file.length
      };
    },

    async uploadEngineeringReportImage(request, slug, pageKind, pageSlug) {
      const safeSlug = assertEngineeringReportSlug(slug);
      const safePageKind = assertEngineeringReportPageKind(pageKind);
      const safePageSlug = assertEngineeringReportSlug(pageSlug);
      const report = await readEngineeringReport(safeSlug);

      if (safePageKind === "section") {
        findEngineeringReportSection(report, safePageSlug);
      } else {
        findEngineeringReportSubsection(report, safePageSlug);
      }

      const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const originalName = request.headers["x-file-name"];
      const fileName = safeAssetFilename(originalName, contentType);
      const file = await readBinaryRequest(request, MAX_IMAGE_BYTES, "Image file is too large. Use a file under 5 MB.");

      if (!file.length) {
        throw httpError(400, "Choose an image file before uploading.");
      }

      assertImageSignature(file, contentType);

      const assetDir = path.join(root, "public/assets/engineering-reports", safeSlug, safePageKind, safePageSlug);
      const filePath = path.join(assetDir, fileName);
      const image = {
        path: `/assets/engineering-reports/${safeSlug}/${safePageKind}/${safePageSlug}/${fileName}`,
        caption: "",
        copyright: "",
        fileName,
        type: contentType,
        size: file.length,
        addedAt: new Date().toISOString()
      };

      await fs.mkdir(assetDir, { recursive: true });
      await fs.writeFile(filePath, file);
      await backupWrittenFile(filePath, path.join("public/assets/engineering-reports", safeSlug, safePageKind, safePageSlug, fileName));

      return {
        image,
        images: await addEngineeringReportImage(safeSlug, safePageKind, safePageSlug, image)
      };
    },

    async uploadEngineeringReportSpreadsheet(request, slug, sectionSlug) {
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSectionSlug = assertEngineeringReportSlug(sectionSlug);
      const report = await readEngineeringReport(safeSlug);

      findEngineeringReportSection(report, safeSectionSlug);

      const originalName = request.headers["x-file-name"];
      const contentType = spreadsheetContentType(originalName, request.headers["content-type"]);
      const fileName = safeSpreadsheetFilename(originalName, contentType);
      const file = await readBinaryRequest(request, MAX_SPREADSHEET_BYTES, "Spreadsheet file is too large. Use a file under 10 MB.");

      if (!file.length) {
        throw httpError(400, "Choose a spreadsheet file before uploading.");
      }

      assertSpreadsheetSignature(file, contentType);

      const assetDir = path.join(root, "public/assets/engineering-reports", safeSlug, "section", safeSectionSlug, "spreadsheets");
      const filePath = path.join(assetDir, fileName);
      const spreadsheet = {
        path: `/assets/engineering-reports/${safeSlug}/section/${safeSectionSlug}/spreadsheets/${fileName}`,
        caption: String(originalName || "").replace(/[^\x20-\x7E]/g, "-").trim(),
        fileName,
        type: contentType,
        size: file.length,
        addedAt: new Date().toISOString()
      };

      await fs.mkdir(assetDir, { recursive: true });
      await fs.writeFile(filePath, file);
      await backupWrittenFile(filePath, path.join("public/assets/engineering-reports", safeSlug, "section", safeSectionSlug, "spreadsheets", fileName));

      return {
        spreadsheet,
        spreadsheets: await addEngineeringReportSpreadsheet(safeSlug, safeSectionSlug, spreadsheet)
      };
    },

    async importPdf(request, type) {
      const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const fileName = String(request.headers["x-file-name"] || "");
      const file = await readBinaryRequest(request, MAX_PDF_BYTES, "PDF file is too large. Use a file under 20 MB.");

      if (!file.length) {
        throw httpError(400, "Choose a PDF file before importing.");
      }

      assertPdfUpload(file, contentType);

      if (type === "bd") {
        return importBdDocumentPdf(file, { fileName });
      }

      return importProjectPdf(file, { fileName });
    },

    async importProjectWord(request) {
      return {
        project: projectFromDocx(await readWordDocumentRequest(request))
      };
    },

    async importBdDocumentWord(request) {
      return {
        document: bdDocumentFromDocx(await readWordDocumentRequest(request))
      };
    }
  };
}
