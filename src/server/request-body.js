import { httpError } from "./http.js";

export async function readJsonRequest(request) {
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

export async function readFormRequest(request) {
  const contentType = request.headers["content-type"] || "";

  if (!contentType.includes("application/x-www-form-urlencoded")) {
    throw httpError(415, "Expected a form request body.");
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

  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

export async function readTextRequest(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > 1_000_000) {
      throw httpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function readContributionReplyRequest(request) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    return readJsonRequest(request);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return readFormRequest(request);
  }

  return {
    body: await readTextRequest(request)
  };
}

export async function readBinaryRequest(request, maxBytes, tooLargeMessage = "Request body is too large.") {
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
