import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toHtml } from "./lib/html.js";
import { assertProjectSlug, blankProject, listProjects, readProject, saveProject } from "./lib/projects.js";
import { renderDashboard, renderBuilder } from "./templates/app.js";
import { renderCaseStudy } from "./templates/case-study.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const IMAGE_TYPES = new Map([
  ["image/svg+xml", ".svg"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"]
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function httpError(status, message) {
  return new HttpError(status, message);
}

function sendHtml(response, fragment) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(toHtml(fragment));
}

function sendJson(response, data) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(data, null, 2)}\n`);
}

function sendPdf(response, slug, file) {
  response.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${slug}.pdf"`,
    "Content-Length": file.length
  });
  response.end(file);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
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
  if (status >= 500) {
    return "Something went wrong.";
  }

  if (error instanceof SyntaxError) {
    return "Request body must be valid JSON.";
  }

  return error.message || "Request failed.";
}

function fail(request, response, status, message) {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  if (request.url?.startsWith("/api/")) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(`${JSON.stringify({ error: message })}\n`);
    return;
  }

  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
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

async function readBinaryRequest(request, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;

    if (total > maxBytes) {
      throw httpError(413, "Image file is too large. Use a file under 5 MB.");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function safeAssetFilename(fileName, contentType) {
  const parsed = path.parse(String(fileName || "case-study-image"));
  const baseName = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "case-study-image";
  const requestedExtension = parsed.ext.toLowerCase();
  const expectedExtension = IMAGE_TYPES.get(contentType);
  const extension = expectedExtension || requestedExtension;

  if (!expectedExtension) {
    throw httpError(415, "Unsupported image type. Use SVG, PNG, JPG or WebP.");
  }

  return `${baseName}-${Date.now()}${extension}`;
}

async function uploadAsset(request, slug) {
  const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const originalName = request.headers["x-file-name"];
  const fileName = safeAssetFilename(originalName, contentType);
  const file = await readBinaryRequest(request, MAX_IMAGE_BYTES);

  if (!file.length) {
    throw httpError(400, "Choose an image file before uploading.");
  }

  const assetDir = path.join(ROOT, "public/assets/projects", slug);
  const filePath = path.join(assetDir, fileName);

  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(filePath, file);

  return {
    path: `/assets/projects/${slug}/${fileName}`,
    fileName,
    type: contentType,
    size: file.length
  };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw httpError(500, "Playwright is not installed. Run npm install before exporting PDFs.");
  }
}

async function exportProjectPdf(slug) {
  await readProject(slug);

  const { chromium } = await loadPlaywright();
  const outputDir = path.join(ROOT, "exports");
  const outputPath = path.join(outputDir, `${slug}.pdf`);
  let browser;

  try {
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 1800
      }
    });

    const previewUrl = `http://${HOST}:${PORT}/projects/${slug}`;
    const pageResponse = await page.goto(previewUrl, { waitUntil: "networkidle" });

    if (!pageResponse?.ok()) {
      throw httpError(502, `Preview route returned HTTP ${pageResponse?.status() || "unknown"}.`);
    }

    await page.emulateMedia({ media: "print" });

    const file = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true
    });

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, file);

    return file;
  } finally {
    if (browser) {
      await browser.close().catch(error => {
        console.error(`Could not close browser cleanly: ${error.message}`);
      });
    }
  }
}

async function readProjectForBuilder(slug) {
  try {
    return await readProject(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return blankProject();
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

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (pathname === "/health") {
      sendJson(response, { ok: true });
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

    if (request.method === "GET" && pathname.startsWith("/api/export/pdf/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/pdf/", ""));
      sendPdf(response, slug, await exportProjectPdf(slug));
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      sendHtml(response, renderDashboard(await listProjects()));
      return;
    }

    if (request.method === "GET" && pathname === "/builder") {
      const projects = await listProjects();
      redirect(response, `/builder/${projects[0]?.slug || "uber-sample"}`);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/builder/")) {
      const slug = assertProjectSlug(pathname.replace("/builder/", ""));
      sendHtml(response, renderBuilder(await readProjectForBuilder(slug), slug));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/projects/")) {
      const slug = assertProjectSlug(pathname.replace("/projects/", ""));
      sendHtml(response, renderCaseStudy(await readProjectForPreview(slug), { slug }));
      return;
    }

    if (pathname.startsWith("/api/projects/")) {
      const slug = assertProjectSlug(pathname.replace("/api/projects/", ""));

      if (request.method === "GET") {
        sendJson(response, await readProject(slug));
        return;
      }

      if (request.method === "POST") {
        sendJson(response, await saveProject(slug, await readJsonRequest(request)));
        return;
      }

      response.writeHead(405, {
        "Allow": "GET, POST",
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
