import fs from "node:fs/promises";
import path from "node:path";

import { httpError, securityHeaders } from "./http.js";

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

export async function serveStatic(response, baseDir, requestPath) {
  const filePath = safeStaticPath(baseDir, requestPath);
  const file = await fs.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();

  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream"
  });
  response.end(file);
}
