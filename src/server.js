import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertImageSignature, MAX_IMAGE_BYTES, safeAssetFilename } from "./lib/assets.js";
import { assertBackupConfigured, backupWrittenFile } from "./lib/backups.js";
import { authenticateBasicAuth, hasRole, loadUserStore } from "./lib/auth.js";
import {
  assertBdDocumentSlug,
  blankBdDocument,
  listBdDocuments,
  readBdDocument,
  readBdDocumentRecord,
  saveBdDocumentRecord
} from "./lib/bd-documents.js";
import {
  addEngineeringReportSpreadsheet,
  addEngineeringReportImage,
  assertEngineeringReportSlug,
  assertEngineeringReportPageKind,
  findEngineeringReportSection,
  findEngineeringReportSubsection,
  readDefaultEngineeringReport,
  readEngineeringReport,
  saveEngineeringReportOrder,
  saveEngineeringReportSectionDraft,
  saveEngineeringReportSubsectionDraft
} from "./lib/engineering-reports.js";
import { toHtml } from "./lib/html.js";
import { createJobQueue } from "./lib/job-queue.js";
import { assertPdfUpload, importBdDocumentPdf, importProjectPdf, MAX_PDF_BYTES } from "./lib/pdf-import.js";
import { assertProjectSlug, blankProject, listProjects, readProject, readProjectRecord, saveProjectRecord } from "./lib/projects.js";
import {
  bdDocumentFromDocx,
  isDocxBuffer,
  MAX_WORD_DOCUMENT_BYTES,
  projectFromDocx,
  renderBdDocumentDocx,
  renderProjectDocx,
  WORD_DOCUMENT_MIME
} from "./lib/word-documents.js";
import { createImpactWorkbook } from "./lib/xlsx.js";
import { renderBdBuilder } from "./templates/bd-app.js";
import { renderBdDocument } from "./templates/bd-document.js";
import { renderDashboard, renderBuilder } from "./templates/app.js";
import { renderCaseStudy } from "./templates/case-study.js";
import { renderEngineeringOutlineReport, renderEngineeringReport } from "./templates/engineering-report.js";
import { renderMarketingBanner } from "./templates/marketing-banner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const APP_USER = process.env.APP_USER || "admin";
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const REQUIRE_HTTPS = process.env.REQUIRE_HTTPS !== "0" && IS_PRODUCTION;
const PDF_JOB_TIMEOUT_MS = Number(process.env.PDF_JOB_TIMEOUT_MS || 120000);
const PDF_WORKERS = Math.max(1, Number(process.env.PDF_WORKERS || 1));
const INTERNAL_RENDER_TOKEN = process.env.INTERNAL_RENDER_TOKEN || crypto.randomBytes(32).toString("hex");
const PDF_QUEUE = createJobQueue({ concurrency: PDF_WORKERS });

const USER_STORE = await loadUserStore({
  usersFile: process.env.AUTH_USERS_FILE,
  usersJson: process.env.AUTH_USERS,
  legacyUser: APP_USER,
  legacyPassword: APP_PASSWORD,
  isProduction: IS_PRODUCTION
});

assertBackupConfigured({ isProduction: IS_PRODUCTION });
assertProductionTransportConfig();

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".csv": "text/csv; charset=utf-8",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

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

class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = options.expose ?? status < 500;
  }
}

function httpError(status, message, options = {}) {
  return new HttpError(status, message, options);
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
  };
}

function sendHtml(response, fragment) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(toHtml(fragment));
}

function sendJson(response, data, headers = {}) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(`${JSON.stringify(data, null, 2)}\n`);
}

function sendPdf(response, slug, file) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${slug}.pdf"`,
    "Content-Length": file.length
  });
  response.end(file);
}

function sendPng(response, slug, file) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "image/png",
    "Content-Disposition": `attachment; filename="${slug}.png"`,
    "Content-Length": file.length
  });
  response.end(file);
}

function sendXlsx(response, slug, file) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${slug}-impact.xlsx"`,
    "Content-Length": file.length
  });
  response.end(file);
}

function sendWordDocument(response, slug, file) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": WORD_DOCUMENT_MIME,
    "Content-Disposition": `attachment; filename="${slug}.docx"`,
    "Content-Length": file.length
  });
  response.end(file);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function assertProductionTransportConfig() {
  if (IS_PRODUCTION && REQUIRE_HTTPS && !TRUST_PROXY) {
    throw new Error("Production HTTPS enforcement requires TRUST_PROXY=1 behind a TLS reverse proxy, or REQUIRE_HTTPS=0 for isolated local deployments.");
  }
}

function isSecureRequest(request) {
  if (request.socket.encrypted) {
    return true;
  }

  if (!TRUST_PROXY) {
    return false;
  }

  return String(request.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase() === "https";
}

function rejectInsecureRequest(request, response) {
  if (internalRenderUser(request)) {
    return false;
  }

  if (!REQUIRE_HTTPS || isSecureRequest(request)) {
    return false;
  }

  response.writeHead(426, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify({ error: "HTTPS is required in production." })}\n`);
  return true;
}

function internalRenderUser(request) {
  const token = String(request.headers["x-internal-render-token"] || "");

  if (token && safeEqual(token, INTERNAL_RENDER_TOKEN)) {
    return {
      username: "pdf-worker",
      roles: ["admin"]
    };
  }

  return null;
}

async function userForRequest(request) {
  return internalRenderUser(request) || await authenticateBasicAuth(request.headers.authorization, USER_STORE);
}

function requiredRoleFor(request, pathname) {
  if (pathname === "/health") {
    return null;
  }

  if (request.method === "POST") {
    return "editor";
  }

  return "viewer";
}

function requestAuth(response) {
  response.writeHead(401, {
    ...securityHeaders(),
    "WWW-Authenticate": 'Basic realm="Case Study Builder"',
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify({ error: "Authentication required." })}\n`);
}

function rejectForbidden(response) {
  response.writeHead(403, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify({ error: "You do not have permission to perform this action." })}\n`);
}

function errorStatus(error) {
  if (Number.isInteger(error.status)) {
    return error.status;
  }

  if (error instanceof HttpError) {
    return error.status;
  }

  if (error.code === "ENOENT") {
    return 404;
  }

  if (error instanceof SyntaxError || error instanceof URIError) {
    return 400;
  }

  return 500;
}

function publicErrorMessage(error, status) {
  if (error instanceof HttpError && error.expose) {
    return error.message || "Request failed.";
  }

  if (status >= 500) {
    return "Something went wrong.";
  }

  if (error instanceof SyntaxError) {
    return "Request body must be valid JSON.";
  }

  return error.message || "Request failed.";
}

function renderWorkerHttpError(kind, detail) {
  const lowerDetail = String(detail || "").toLowerCase();
  const label = kind === "image" ? "Image" : "PDF";

  if (lowerDetail.includes("playwright is not installed")) {
    return httpError(
      503,
      `${label} export needs Playwright on this machine. Run npm install, then npm run setup:local, and try again.`,
      { expose: true }
    );
  }

  if (lowerDetail.includes("chromium browser is missing") || lowerDetail.includes("executable doesn't exist")) {
    return httpError(
      503,
      `${label} export needs Playwright Chromium on this machine. Run npm run setup:local, then npm run preflight:render, and try again.`,
      { expose: true }
    );
  }

  if (lowerDetail.includes("host system is missing dependencies")) {
    return httpError(
      503,
      `${label} export needs missing browser system dependencies. On Linux, run npx playwright install --with-deps chromium, then try again.`,
      { expose: true }
    );
  }

  return httpError(500, detail || `${label} worker failed.`);
}

function fail(request, response, status, message) {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  if (request.url?.startsWith("/api/")) {
    response.writeHead(status, {
      ...securityHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(`${JSON.stringify({ error: message })}\n`);
    return;
  }

  response.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(message);
}

function safeStaticPath(baseDir, requestPath) {
  let decoded;

  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    throw httpError(400, "Invalid encoded path.");
  }

  const filePath = path.resolve(baseDir, decoded);

  if (!filePath.startsWith(`${baseDir}${path.sep}`)) {
    throw httpError(400, "Invalid static path.");
  }

  return filePath;
}

async function serveStatic(response, baseDir, requestPath) {
  const filePath = safeStaticPath(baseDir, requestPath);
  const file = await fs.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();

  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream"
  });
  response.end(file);
}

async function readJsonRequest(request) {
  const contentType = request.headers["content-type"] || "";

  if (!contentType.includes("application/json")) {
    throw httpError(415, "Expected an application/json request body.");
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > 1_000_000) {
      throw httpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

async function readBinaryRequest(request, maxBytes, tooLargeMessage = "Request body is too large.") {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;

    if (total > maxBytes) {
      throw httpError(413, tooLargeMessage);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function uploadAsset(request, slug) {
  const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const originalName = request.headers["x-file-name"];
  const fileName = safeAssetFilename(originalName, contentType);
  const file = await readBinaryRequest(request, MAX_IMAGE_BYTES, "Image file is too large. Use a file under 5 MB.");

  if (!file.length) {
    throw httpError(400, "Choose an image file before uploading.");
  }

  assertImageSignature(file, contentType);

  const assetDir = path.join(ROOT, "public/assets/projects", slug);
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
}

async function uploadEngineeringReportImage(request, slug, pageKind, pageSlug) {
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

  const assetDir = path.join(ROOT, "public/assets/engineering-reports", safeSlug, safePageKind, safePageSlug);
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
}

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

async function uploadEngineeringReportSpreadsheet(request, slug, sectionSlug) {
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

  const assetDir = path.join(ROOT, "public/assets/engineering-reports", safeSlug, "section", safeSectionSlug, "spreadsheets");
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
}

async function importPdf(request, type) {
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

function localPreviewOrigin() {
  const host = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  return `http://${host}:${PORT}`;
}

async function renderPdfWithWorker(previewPath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, ["scripts/render-pdf-worker.js"], {
      env: {
        ...process.env,
        PREVIEW_URL: `${localPreviewOrigin()}${previewPath}`,
        OUTPUT_PATH: outputPath,
        INTERNAL_RENDER_TOKEN
      },
      stdio: ["ignore", "ignore", "pipe"]
    });
    const stderr = [];
    const timeout = setTimeout(() => {
      worker.kill("SIGTERM");
      reject(httpError(504, "PDF export timed out."));
    }, PDF_JOB_TIMEOUT_MS);

    worker.stderr.on("data", chunk => stderr.push(chunk));
    worker.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.on("exit", code => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      const detail = Buffer.concat(stderr).toString("utf8").trim();
      reject(renderWorkerHttpError("pdf", detail));
    });
  });

  await backupWrittenFile(outputPath, path.join("exports", path.basename(outputPath)));
  return fs.readFile(outputPath);
}

async function renderImageWithWorker(previewPath, outputPath, options = {}) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, ["scripts/render-image-worker.js"], {
      env: {
        ...process.env,
        PREVIEW_URL: `${localPreviewOrigin()}${previewPath}`,
        OUTPUT_PATH: outputPath,
        INTERNAL_RENDER_TOKEN,
        IMAGE_WIDTH: String(options.width || 1600),
        IMAGE_HEIGHT: String(options.height || 900)
      },
      stdio: ["ignore", "ignore", "pipe"]
    });
    const stderr = [];
    const timeout = setTimeout(() => {
      worker.kill("SIGTERM");
      reject(httpError(504, "Image export timed out."));
    }, PDF_JOB_TIMEOUT_MS);

    worker.stderr.on("data", chunk => stderr.push(chunk));
    worker.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.on("exit", code => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      const detail = Buffer.concat(stderr).toString("utf8").trim();
      reject(renderWorkerHttpError("image", detail));
    });
  });

  await backupWrittenFile(outputPath, path.join("exports", path.basename(outputPath)));
  return fs.readFile(outputPath);
}

async function exportProjectPdf(slug) {
  await readProject(slug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}.pdf`);

  return renderPdfWithWorker(`/projects/${slug}`, outputPath);
}

async function exportProjectMarketingBanner(slug) {
  await readProject(slug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}-marketing-banner.png`);

  return renderImageWithWorker(`/marketing-banner/projects/${slug}`, outputPath);
}

async function exportProjectXlsx(slug) {
  const project = await readProject(slug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}-impact.xlsx`);
  const file = createImpactWorkbook(project);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, file);
  await backupWrittenFile(outputPath, path.join("exports", path.basename(outputPath)));

  return file;
}

async function exportEngineeringReportPdf(slug) {
  await readProject(slug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}-engineering-report.pdf`);

  return renderPdfWithWorker(`/engineering-reports/${slug}`, outputPath);
}

async function exportEngineeringOutlinePdf(slug) {
  await readEngineeringReport(slug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}-engineering-report.pdf`);

  return renderPdfWithWorker(`/engineering-report/${slug}`, outputPath);
}

async function exportEngineeringOutlineSectionPdf(slug, sectionSlug) {
  const report = await readEngineeringReport(slug);
  const section = findEngineeringReportSection(report, sectionSlug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}-${section.slug}.pdf`);

  return renderPdfWithWorker(`/engineering-report/${slug}/sections/${section.slug}`, outputPath);
}

async function exportEngineeringOutlineSubsectionPdf(slug, subsectionSlug) {
  const report = await readEngineeringReport(slug);
  const subsection = findEngineeringReportSubsection(report, subsectionSlug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}-${subsection.slug}.pdf`);

  return renderPdfWithWorker(`/engineering-report/${slug}/subsections/${subsection.slug}`, outputPath);
}

async function exportBdDocumentPdf(slug) {
  await readBdDocument(slug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}-bd.pdf`);

  return renderPdfWithWorker(`/bd/${slug}`, outputPath);
}

async function exportBdDocumentMarketingBanner(slug) {
  await readBdDocument(slug);
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}-bd-marketing-banner.png`);

  return renderImageWithWorker(`/marketing-banner/bd/${slug}`, outputPath);
}

async function exportProjectWord(slug) {
  return renderProjectDocx(await readProject(slug));
}

async function exportBdDocumentWord(slug) {
  return renderBdDocumentDocx(await readBdDocument(slug));
}

async function importProjectWord(request) {
  return {
    project: projectFromDocx(await readWordDocumentRequest(request))
  };
}

async function importBdDocumentWord(request) {
  return {
    document: bdDocumentFromDocx(await readWordDocumentRequest(request))
  };
}

async function readProjectForBuilder(slug) {
  try {
    return await readProjectRecord(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        project: blankProject(),
        revision: "new"
      };
    }
    throw error;
  }
}

async function readProjectForPreview(slug) {
  try {
    return await readProject(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return blankProject({
        title: "Unsaved case study",
        subtitle: "This preview is using a draft shell because the project JSON has not been saved yet."
      });
    }
    throw error;
  }
}

async function readBdDocumentForBuilder(slug) {
  try {
    return await readBdDocumentRecord(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        document: blankBdDocument(),
        revision: "new"
      };
    }
    throw error;
  }
}

async function readBdDocumentForPreview(slug) {
  try {
    return await readBdDocument(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return blankBdDocument({
        title: "Unsaved business development document",
        subtitle: "This preview is using a draft shell because the document JSON has not been saved yet."
      });
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (pathname === "/health") {
      sendJson(response, { ok: true, pdfQueue: PDF_QUEUE.stats() });
      return;
    }

    if (rejectInsecureRequest(request, response)) {
      return;
    }

    const requiredRole = requiredRoleFor(request, pathname);
    const user = await userForRequest(request);

    if (requiredRole && !user) {
      requestAuth(response);
      return;
    }

    if (requiredRole && !hasRole(user, requiredRole)) {
      rejectForbidden(response);
      return;
    }

    if (pathname.startsWith("/assets/")) {
      await serveStatic(response, path.join(ROOT, "public/assets"), pathname.replace("/assets/", ""));
      return;
    }

    if (pathname.startsWith("/app/")) {
      await serveStatic(response, path.join(ROOT, "src/app"), pathname.replace("/app/", ""));
      return;
    }

    if (pathname === "/pdf/theme.css") {
      await serveStatic(response, path.join(ROOT, "src/pdf"), "theme.css");
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/bd/banner/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/api/export/bd/banner/", ""));
      sendPng(response, `${slug}-bd-marketing-banner`, await PDF_QUEUE.add(() => exportBdDocumentMarketingBanner(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/bd/pdf/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/api/export/bd/pdf/", ""));
      sendPdf(response, `${slug}-bd`, await PDF_QUEUE.add(() => exportBdDocumentPdf(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/bd/word/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/api/export/bd/word/", ""));
      sendWordDocument(response, `${slug}-bd`, await exportBdDocumentWord(slug));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/pdf/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/pdf/", ""));
      sendPdf(response, slug, await PDF_QUEUE.add(() => exportProjectPdf(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/banner/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/banner/", ""));
      sendPng(response, `${slug}-marketing-banner`, await PDF_QUEUE.add(() => exportProjectMarketingBanner(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/word/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/word/", ""));
      sendWordDocument(response, slug, await exportProjectWord(slug));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/engineering/compile/")) {
      const slug = assertEngineeringReportSlug(pathname.replace("/api/export/engineering/compile/", ""));
      sendPdf(response, `${slug}-engineering-report`, await PDF_QUEUE.add(() => exportEngineeringOutlinePdf(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/engineering/section/")) {
      const [slug, sectionSlug] = pathname.replace("/api/export/engineering/section/", "").split("/").filter(Boolean);
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSectionSlug = assertEngineeringReportSlug(sectionSlug);
      sendPdf(response, `${safeSlug}-${safeSectionSlug}`, await PDF_QUEUE.add(() => exportEngineeringOutlineSectionPdf(safeSlug, safeSectionSlug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/engineering/subsection/")) {
      const [slug, subsectionSlug] = pathname.replace("/api/export/engineering/subsection/", "").split("/").filter(Boolean);
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSubsectionSlug = assertEngineeringReportSlug(subsectionSlug);
      sendPdf(response, `${safeSlug}-${safeSubsectionSlug}`, await PDF_QUEUE.add(() => exportEngineeringOutlineSubsectionPdf(safeSlug, safeSubsectionSlug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/engineering/pdf/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/engineering/pdf/", ""));
      sendPdf(response, `${slug}-engineering-report`, await PDF_QUEUE.add(() => exportEngineeringReportPdf(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/xlsx/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/xlsx/", ""));
      sendXlsx(response, slug, await exportProjectXlsx(slug));
      return;
    }

    if (request.method === "POST" && pathname === "/api/import/pdf") {
      sendJson(response, await importPdf(request, "project"));
      return;
    }

    if (request.method === "POST" && pathname === "/api/import/bd/pdf") {
      sendJson(response, await importPdf(request, "bd"));
      return;
    }

    if (request.method === "POST" && pathname === "/api/import/bd/word") {
      sendJson(response, await importBdDocumentWord(request));
      return;
    }

    if (request.method === "POST" && pathname === "/api/import/word") {
      sendJson(response, await importProjectWord(request));
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      const [projects, bdDocuments, engineeringReport] = await Promise.all([
        listProjects(),
        listBdDocuments(),
        readDefaultEngineeringReport()
      ]);

      sendHtml(response, renderDashboard(projects, bdDocuments, {
        engineeringReport,
        activeView: url.searchParams.get("view")
      }));
      return;
    }

    if (request.method === "GET" && pathname === "/builder") {
      const projects = await listProjects();
      redirect(response, `/builder/${projects[0]?.slug || "uber-sample"}`);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/builder/")) {
      const slug = assertProjectSlug(pathname.replace("/builder/", ""));
      const record = await readProjectForBuilder(slug);
      sendHtml(response, renderBuilder(record.project, slug, { revision: record.revision }));
      return;
    }

    if (request.method === "GET" && pathname === "/bd-builder") {
      const documents = await listBdDocuments();
      redirect(response, `/bd-builder/${documents[0]?.slug || "enterprise-build-support"}`);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/bd-builder/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/bd-builder/", ""));
      const record = await readBdDocumentForBuilder(slug);
      sendHtml(response, renderBdBuilder(record.document, slug, { revision: record.revision }));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/marketing-banner/projects/")) {
      const slug = assertProjectSlug(pathname.replace("/marketing-banner/projects/", ""));
      sendHtml(response, renderMarketingBanner(await readProjectForPreview(slug), { slug, type: "project" }));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/marketing-banner/bd/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/marketing-banner/bd/", ""));
      sendHtml(response, renderMarketingBanner(await readBdDocumentForPreview(slug), { slug, type: "bd" }));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/projects/")) {
      const slug = assertProjectSlug(pathname.replace("/projects/", ""));
      sendHtml(response, renderCaseStudy(await readProjectForPreview(slug), { slug }));
      return;
    }

    if (request.method === "GET" && pathname === "/engineering-report") {
      redirect(response, "/engineering-report/stage-2-basis-of-design");
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/engineering-report/")) {
      const parts = pathname.replace("/engineering-report/", "").split("/").filter(Boolean);
      const slug = assertEngineeringReportSlug(parts[0]);
      const report = await readEngineeringReport(slug);

      if (parts.length === 1) {
        sendHtml(response, renderEngineeringOutlineReport(report));
        return;
      }

      if (parts.length === 3 && parts[1] === "sections") {
        sendHtml(response, renderEngineeringOutlineReport(report, {
          section: findEngineeringReportSection(report, parts[2])
        }));
        return;
      }

      if (parts.length === 4 && parts[1] === "sections" && parts[3] === "edit") {
        sendHtml(response, renderEngineeringOutlineReport(report, {
          section: findEngineeringReportSection(report, parts[2]),
          mode: "edit"
        }));
        return;
      }

      if (parts.length === 3 && parts[1] === "subsections") {
        sendHtml(response, renderEngineeringOutlineReport(report, {
          subsection: findEngineeringReportSubsection(report, parts[2])
        }));
        return;
      }

      if (parts.length === 4 && parts[1] === "subsections" && parts[3] === "edit") {
        sendHtml(response, renderEngineeringOutlineReport(report, {
          subsection: findEngineeringReportSubsection(report, parts[2]),
          mode: "edit"
        }));
        return;
      }

      throw httpError(404, "Engineering report route was not found.");
    }

    if (request.method === "GET" && pathname === "/engineering-reports") {
      const projects = await listProjects();
      redirect(response, `/engineering-reports/${projects[0]?.slug || "uber-sample"}`);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/engineering-reports/")) {
      const slug = assertProjectSlug(pathname.replace("/engineering-reports/", ""));
      sendHtml(response, renderEngineeringReport(await readProjectForPreview(slug), { slug }));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/bd/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/bd/", ""));
      sendHtml(response, renderBdDocument(await readBdDocumentForPreview(slug), { slug }));
      return;
    }

    if (pathname.startsWith("/api/projects/")) {
      const slug = assertProjectSlug(pathname.replace("/api/projects/", ""));

      if (request.method === "GET") {
        const record = await readProjectRecord(slug);
        sendJson(response, record.project, { "ETag": `"${record.revision}"` });
        return;
      }

      if (request.method === "POST") {
        if (!request.headers["if-match"]) {
          throw httpError(428, "Missing If-Match header. Reload the project before saving.");
        }

        const ifMatch = String(request.headers["if-match"]).replace(/^"|"$/g, "");
        const record = await saveProjectRecord(slug, await readJsonRequest(request), ifMatch);
        sendJson(response, record.project, { "ETag": `"${record.revision}"` });
        return;
      }

      response.writeHead(405, {
        "Allow": "GET, POST",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
      return;
    }

    if (pathname.startsWith("/api/bd-documents/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/api/bd-documents/", ""));

      if (request.method === "GET") {
        const record = await readBdDocumentRecord(slug);
        sendJson(response, record.document, { "ETag": `"${record.revision}"` });
        return;
      }

      if (request.method === "POST") {
        if (!request.headers["if-match"]) {
          throw httpError(428, "Missing If-Match header. Reload the business development document before saving.");
        }

        const ifMatch = String(request.headers["if-match"]).replace(/^"|"$/g, "");
        const record = await saveBdDocumentRecord(slug, await readJsonRequest(request), ifMatch);
        sendJson(response, record.document, { "ETag": `"${record.revision}"` });
        return;
      }

      response.writeHead(405, {
        "Allow": "GET, POST",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-images/")) {
      const [slug, pageKind, pageSlug] = pathname.replace("/api/engineering-report-images/", "").split("/").filter(Boolean);

      if (request.method === "POST") {
        sendJson(response, await uploadEngineeringReportImage(request, slug, pageKind, pageSlug));
        return;
      }

      response.writeHead(405, {
        "Allow": "POST",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-spreadsheets/")) {
      const [slug, sectionSlug] = pathname.replace("/api/engineering-report-spreadsheets/", "").split("/").filter(Boolean);

      if (request.method === "POST") {
        sendJson(response, await uploadEngineeringReportSpreadsheet(request, slug, sectionSlug));
        return;
      }

      response.writeHead(405, {
        "Allow": "POST",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-sections/")) {
      const [slug, sectionSlug] = pathname.replace("/api/engineering-report-sections/", "").split("/").filter(Boolean);
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSectionSlug = assertEngineeringReportSlug(sectionSlug);

      if (request.method === "POST") {
        sendJson(response, {
          draft: await saveEngineeringReportSectionDraft(safeSlug, safeSectionSlug, await readJsonRequest(request))
        });
        return;
      }

      response.writeHead(405, {
        "Allow": "POST",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-subsections/")) {
      const [slug, subsectionSlug] = pathname.replace("/api/engineering-report-subsections/", "").split("/").filter(Boolean);
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSubsectionSlug = assertEngineeringReportSlug(subsectionSlug);

      if (request.method === "POST") {
        sendJson(response, {
          draft: await saveEngineeringReportSubsectionDraft(safeSlug, safeSubsectionSlug, await readJsonRequest(request))
        });
        return;
      }

      response.writeHead(405, {
        "Allow": "POST",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-order/")) {
      const safeSlug = assertEngineeringReportSlug(pathname.replace("/api/engineering-report-order/", ""));

      if (request.method === "POST") {
        sendJson(response, {
          report: await saveEngineeringReportOrder(safeSlug, await readJsonRequest(request))
        });
        return;
      }

      response.writeHead(405, {
        "Allow": "POST",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
      return;
    }

    if (pathname.startsWith("/api/assets/")) {
      const slug = assertProjectSlug(pathname.replace("/api/assets/", ""));

      if (request.method === "POST") {
        sendJson(response, await uploadAsset(request, slug));
        return;
      }

      response.writeHead(405, {
        "Allow": "POST",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
      return;
    }

    fail(request, response, 404, "Not found.");
  } catch (error) {
    const status = errorStatus(error);
    const message = publicErrorMessage(error, status);

    if (status >= 500) {
      console.error(error);
    }

    fail(request, response, status, message);
  }
}

const server = http.createServer(handleRequest);

server.on("clientError", (error, socket) => {
  console.warn(`Bad HTTP request: ${error.message}`);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use on ${HOST}.`);
  } else if (error.code === "EACCES" || error.code === "EPERM") {
    console.error(`Cannot bind to ${HOST}:${PORT}. Check local networking permissions.`);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});

process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Case-study builder running at http://${HOST}:${PORT}`);
});
