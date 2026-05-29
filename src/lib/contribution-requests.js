import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { backupExistingFile } from "./backups.js";
import { assertEngineeringReportPageKind, assertEngineeringReportSlug } from "./engineering-reports.js";

const CONTRIBUTION_REQUESTS_DIR = path.resolve(
  process.env.ENGINEERING_REPORT_CONTRIBUTION_REQUESTS_DIR || path.join(process.cwd(), "data/engineering-report-contribution-requests")
);
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const MAX_EMAIL_LENGTH = 320;
const MAX_NAME_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TITLE_LENGTH = 240;
const MAX_RESPONSE_BODY_LENGTH = 60_000;
const REPLY_BODY_KEYS = [
  "stripped-text",
  "strippedText",
  "StrippedTextReply",
  "TextBody",
  "textBody",
  "body-plain",
  "bodyPlain",
  "text",
  "body",
  "Body"
];
const REPLY_TOKEN_KEYS = [
  "token",
  "Token",
  "contributionToken",
  "contribution_token",
  "X-Contribution-Token",
  "x-contribution-token",
  "subject",
  "Subject"
];
const REPLY_SENDER_KEYS = [
  "FromName",
  "fromName",
  "sender",
  "Sender",
  "from",
  "From"
];

function asText(value) {
  return String(value ?? "").trim();
}

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requestPath(token) {
  return path.join(CONTRIBUTION_REQUESTS_DIR, `${assertContributionRequestToken(token)}.json`);
}

function relativeRequestPath(token) {
  return path.join("data/engineering-report-contribution-requests", `${assertContributionRequestToken(token)}.json`);
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function boundedText(label, value, maxLength) {
  const text = asText(value);

  if (text.length > maxLength) {
    throw requestError(`${label} must be ${maxLength} characters or fewer.`, 422);
  }

  return text;
}

function normalizeEmail(value) {
  const email = boundedText("Recipient email", value, MAX_EMAIL_LENGTH);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw requestError("Recipient email must be a valid email address.", 422);
  }

  return email;
}

function firstPayloadValue(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];

    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value);
    }
  }

  return "";
}

function extractTokenFromText(value) {
  const match = String(value || "").match(/[a-f0-9]{48}/i);

  return match ? match[0].toLowerCase() : "";
}

function stripQuotedReply(value) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  const cutPatterns = [
    /^Contribution request:\s*[a-f0-9]{48}\b/im,
    /^Please reply above this line\./im,
    /^On .+ wrote:\s*$/im,
    /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^From:\s.+$/im
  ];
  let cutIndex = text.length;

  cutPatterns.forEach(pattern => {
    const match = pattern.exec(text);

    if (match && match.index < cutIndex) {
      cutIndex = match.index;
    }
  });

  return text
    .slice(0, cutIndex)
    .split("\n")
    .filter(line => !line.trim().startsWith(">"))
    .join("\n")
    .trim();
}

function normalizeResponse(response) {
  if (!response || typeof response !== "object") {
    return null;
  }

  const contributorName = boundedText("Contributor name", response.contributorName, MAX_NAME_LENGTH);
  const body = String(response.body ?? "").replace(/\r\n?/g, "\n").trim();

  if (body.length > MAX_RESPONSE_BODY_LENGTH) {
    throw requestError(`Response text must be ${MAX_RESPONSE_BODY_LENGTH} characters or fewer.`, 422);
  }

  const submittedAt = boundedText("Submitted at", response.submittedAt, 80);

  if (!contributorName && !body && !submittedAt) {
    return null;
  }

  return {
    contributorName,
    body,
    submittedAt
  };
}

function normalizeContributionRequest(request) {
  const token = assertContributionRequestToken(request?.token);
  const response = normalizeResponse(request?.response);

  return {
    token,
    reportSlug: assertEngineeringReportSlug(request?.reportSlug),
    pageKind: assertEngineeringReportPageKind(request?.pageKind),
    pageSlug: assertEngineeringReportSlug(request?.pageSlug),
    pageTitle: boundedText("Page title", request?.pageTitle, MAX_TITLE_LENGTH),
    reportTitle: boundedText("Report title", request?.reportTitle, MAX_TITLE_LENGTH),
    recipientEmail: normalizeEmail(request?.recipientEmail),
    recipientName: boundedText("Recipient name", request?.recipientName, MAX_NAME_LENGTH),
    message: boundedText("Message", request?.message, MAX_MESSAGE_LENGTH),
    createdBy: boundedText("Created by", request?.createdBy, MAX_NAME_LENGTH),
    createdAt: boundedText("Created at", request?.createdAt, 80) || new Date().toISOString(),
    submittedAt: boundedText("Submitted at", request?.submittedAt, 80),
    response
  };
}

async function writeContributionRequest(request) {
  const normalized = normalizeContributionRequest(request);
  const filePath = requestPath(normalized.token);
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(CONTRIBUTION_REQUESTS_DIR, { recursive: true });
  await backupExistingFile(filePath, relativeRequestPath(normalized.token));
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);

  return normalized;
}

export function assertContributionRequestToken(token) {
  const normalized = asText(token);

  if (!TOKEN_PATTERN.test(normalized)) {
    throw requestError("Contribution request token is invalid.", 404);
  }

  return normalized;
}

export async function createContributionRequest(request) {
  return writeContributionRequest({
    ...request,
    token: randomToken(),
    createdAt: new Date().toISOString(),
    submittedAt: "",
    response: null
  });
}

export async function readContributionRequest(token) {
  const safeToken = assertContributionRequestToken(token);
  const file = await fs.readFile(requestPath(safeToken), "utf8");

  try {
    return normalizeContributionRequest(JSON.parse(file));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw requestError("Contribution request must be valid JSON.");
    }

    throw error;
  }
}

export async function listContributionRequestsForReport(slug) {
  const safeSlug = assertEngineeringReportSlug(slug);

  let files = [];

  try {
    files = await fs.readdir(CONTRIBUTION_REQUESTS_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const requests = [];

  for (const file of files.filter(file => file.endsWith(".json")).sort()) {
    const token = file.replace(/\.json$/, "");

    try {
      const request = await readContributionRequest(token);

      if (request.reportSlug === safeSlug) {
        requests.push(request);
      }
    } catch {
      // Ignore stale or malformed request files; they should not break report rendering.
    }
  }

  return requests.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function extractContributionReplyPayload(payload = {}) {
  const body = stripQuotedReply(firstPayloadValue(payload, REPLY_BODY_KEYS));
  const token = extractTokenFromText(
    [
      firstPayloadValue(payload, REPLY_TOKEN_KEYS),
      firstPayloadValue(payload, REPLY_BODY_KEYS)
    ].join("\n")
  );
  const contributorName = boundedText("Contributor name", firstPayloadValue(payload, REPLY_SENDER_KEYS), MAX_NAME_LENGTH);

  if (!token) {
    throw requestError("Contribution reply must include a request token.", 422);
  }

  if (!body) {
    throw requestError("Contribution reply body cannot be empty.", 422);
  }

  return {
    token: assertContributionRequestToken(token),
    contributorName,
    body
  };
}

export async function markContributionRequestSubmitted(token, response) {
  const request = await readContributionRequest(token);
  const submittedAt = new Date().toISOString();

  return writeContributionRequest({
    ...request,
    submittedAt,
    response: {
      ...response,
      submittedAt
    }
  });
}
