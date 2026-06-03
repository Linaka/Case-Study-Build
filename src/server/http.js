import { toHtml } from "../lib/html.js";
import { WORD_DOCUMENT_MIME } from "../lib/word-documents.js";

export class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = options.expose ?? status < 500;
  }
}

export function httpError(status, message, options = {}) {
  return new HttpError(status, message, options);
}

export function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
  };
}

export function sendHtml(response, fragment) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(toHtml(fragment));
}

export function sendJson(response, data, headers = {}) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(`${JSON.stringify(data, null, 2)}\n`);
}

function sendBinary(response, contentType, filename, file) {
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": file.length
  });
  response.end(file);
}

export function sendPdf(response, slug, file) {
  sendBinary(response, "application/pdf", `${slug}.pdf`, file);
}

export function sendPng(response, slug, file) {
  sendBinary(response, "image/png", `${slug}.png`, file);
}

export function sendXlsx(response, slug, file) {
  sendBinary(response, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${slug}-impact.xlsx`, file);
}

export function sendWordDocument(response, slug, file) {
  sendBinary(response, WORD_DOCUMENT_MIME, `${slug}.docx`, file);
}

export function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

export function methodNotAllowed(response, allowedMethods) {
  response.writeHead(405, {
    ...securityHeaders(),
    "Allow": allowedMethods.join(", "),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify({ error: "Method not allowed." })}\n`);
}

export function requestAuth(response) {
  response.writeHead(401, {
    ...securityHeaders(),
    "WWW-Authenticate": 'Basic realm="Case Study Builder"',
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify({ error: "Authentication required." })}\n`);
}

export function rejectForbidden(response) {
  response.writeHead(403, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify({ error: "You do not have permission to perform this action." })}\n`);
}

export function errorStatus(error) {
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

export function publicErrorMessage(error, status) {
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

export function fail(request, response, status, message) {
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
