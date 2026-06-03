import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { backupExistingFile } from "./backups.js";
import {
  INFORMATION_SUBJECT_TYPES,
  INFORMATION_TARGET_KINDS,
  applyInformationResponse,
  assertInformationSubjectSlug,
  assertInformationTargetPath,
  resolveInformationTarget
} from "./information-request-adapters.js";

const INFORMATION_REQUESTS_DIR = path.resolve(
  process.env.INFORMATION_REQUESTS_DIR || path.join(process.cwd(), "data/information-requests")
);
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const CHANNELS = new Set(["email", "teams-chat", "teams-channel"]);
const DELIVERY_STATES = new Set(["pending", "sent", "failed"]);
const RESPONSE_STATES = new Set(["pending", "received", "applied", "apply-failed"]);
const MAX_EMAIL_LENGTH = 320;
const MAX_NAME_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TITLE_LENGTH = 240;
const MAX_RESPONSE_BODY_LENGTH = 60_000;
const MAX_DELIVERY_ERROR_LENGTH = 1200;

function asText(value) {
  return String(value ?? "").trim();
}

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requestPath(token) {
  return path.join(INFORMATION_REQUESTS_DIR, `${assertInformationRequestToken(token)}.json`);
}

function relativeRequestPath(token) {
  return path.join("data/information-requests", `${assertInformationRequestToken(token)}.json`);
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

function normalizeEnum(label, value, values) {
  const normalized = asText(value);

  if (!values.has(normalized)) {
    throw requestError(`${label} is invalid.`, 422);
  }

  return normalized;
}

function normalizeOptionalEmail(label, value) {
  const email = boundedText(label, value, MAX_EMAIL_LENGTH);

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw requestError(`${label} must be a valid email address.`, 422);
  }

  return email;
}

function normalizeRecipient(recipient) {
  if (!recipient || typeof recipient !== "object") {
    throw requestError("Recipient must be an object.", 422);
  }

  const email = normalizeOptionalEmail("Recipient email", recipient.email || recipient.address || recipient.userPrincipalName);
  const userPrincipalName = boundedText("Recipient Microsoft username", recipient.userPrincipalName || email, MAX_EMAIL_LENGTH);
  const name = boundedText("Recipient name", recipient.name || recipient.displayName, MAX_NAME_LENGTH);

  if (!email && !userPrincipalName) {
    throw requestError("Recipient must include an email address or Microsoft username.", 422);
  }

  return {
    name,
    email,
    userPrincipalName
  };
}

function normalizeRecipients(value) {
  const recipients = Array.isArray(value) ? value : [value].filter(Boolean);

  return recipients.map(normalizeRecipient);
}

function normalizeSubject(subject) {
  if (!subject || typeof subject !== "object") {
    throw requestError("Request subject must be an object.", 422);
  }

  const type = normalizeEnum("Request subject type", subject.type, INFORMATION_SUBJECT_TYPES);
  const slug = assertInformationSubjectSlug(type, subject.slug);

  return {
    type,
    slug,
    title: boundedText("Subject title", subject.title, MAX_TITLE_LENGTH)
  };
}

function normalizeTarget(target, subjectType) {
  if (!target || typeof target !== "object") {
    throw requestError("Request target must be an object.", 422);
  }

  const kind = normalizeEnum("Request target kind", target.kind, INFORMATION_TARGET_KINDS);
  const pathValue = assertInformationTargetPath(subjectType, kind, target.path || target.slug);

  if (!pathValue) {
    throw requestError("Request target path is required.", 422);
  }

  return {
    kind,
    path: pathValue,
    label: boundedText("Request target label", target.label, MAX_TITLE_LENGTH)
  };
}

function normalizeDeliveryStatus(status = {}) {
  const state = DELIVERY_STATES.has(status.state) ? status.state : "pending";

  return {
    state,
    sentAt: boundedText("Sent at", status.sentAt, 80),
    error: boundedText("Delivery error", status.error, MAX_DELIVERY_ERROR_LENGTH)
  };
}

function normalizeResponseStatus(status = {}) {
  const state = RESPONSE_STATES.has(status.state) ? status.state : "pending";

  return {
    state,
    receivedAt: boundedText("Received at", status.receivedAt, 80),
    appliedAt: boundedText("Applied at", status.appliedAt, 80),
    applyError: boundedText("Apply error", status.applyError, MAX_DELIVERY_ERROR_LENGTH)
  };
}

function normalizeProvider(provider = {}) {
  return {
    graphMessageId: boundedText("Graph message id", provider.graphMessageId, MAX_TITLE_LENGTH),
    chatId: boundedText("Teams chat id", provider.chatId, MAX_TITLE_LENGTH),
    teamId: boundedText("Teams team id", provider.teamId, MAX_TITLE_LENGTH),
    teamName: boundedText("Teams team name", provider.teamName, MAX_TITLE_LENGTH),
    channelId: boundedText("Teams channel id", provider.channelId, MAX_TITLE_LENGTH),
    channelName: boundedText("Teams channel name", provider.channelName, MAX_TITLE_LENGTH),
    webUrl: boundedText("Provider web URL", provider.webUrl, 1000)
  };
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

  const receivedAt = boundedText("Received at", response.receivedAt, 80);
  const appliedAt = boundedText("Applied at", response.appliedAt, 80);
  const applyError = boundedText("Apply error", response.applyError, MAX_DELIVERY_ERROR_LENGTH);

  if (!contributorName && !body && !receivedAt && !appliedAt && !applyError) {
    return null;
  }

  return {
    contributorName,
    body,
    receivedAt,
    appliedAt,
    applyError
  };
}

function normalizeInformationRequest(request) {
  const channel = normalizeEnum("Request channel", request?.channel, CHANNELS);
  const recipients = normalizeRecipients(request?.recipients);
  const subject = normalizeSubject(request?.subject);

  if (channel !== "teams-channel" && recipients.length === 0) {
    throw requestError("Email and Teams chat requests need at least one recipient.", 422);
  }

  return {
    token: assertInformationRequestToken(request?.token),
    subject,
    target: normalizeTarget(request?.target, subject.type),
    channel,
    recipients,
    message: boundedText("Message", request?.message, MAX_MESSAGE_LENGTH),
    createdBy: boundedText("Created by", request?.createdBy, MAX_NAME_LENGTH),
    createdAt: boundedText("Created at", request?.createdAt, 80) || new Date().toISOString(),
    deliveryStatus: normalizeDeliveryStatus(request?.deliveryStatus),
    responseStatus: normalizeResponseStatus(request?.responseStatus),
    provider: normalizeProvider(request?.provider),
    response: normalizeResponse(request?.response)
  };
}

async function writeInformationRequest(request) {
  const normalized = normalizeInformationRequest(request);
  const filePath = requestPath(normalized.token);
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(INFORMATION_REQUESTS_DIR, { recursive: true });
  await backupExistingFile(filePath, relativeRequestPath(normalized.token));
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);

  return normalized;
}

export function assertInformationRequestToken(token) {
  const normalized = asText(token);

  if (!TOKEN_PATTERN.test(normalized)) {
    throw requestError("Information request token is invalid.", 404);
  }

  return normalized;
}

export async function resolveInformationRequestTarget({ subjectType, subjectSlug, targetKind, targetPath }) {
  const safeSubjectType = normalizeEnum("Request subject type", subjectType, INFORMATION_SUBJECT_TYPES);
  const safeTargetKind = normalizeEnum("Request target kind", targetKind, INFORMATION_TARGET_KINDS);
  const safeSubjectSlug = assertInformationSubjectSlug(safeSubjectType, subjectSlug);
  const safeTargetPath = assertInformationTargetPath(safeSubjectType, safeTargetKind, targetPath);
  const resolved = await resolveInformationTarget({
    subjectType: safeSubjectType,
    subjectSlug: safeSubjectSlug,
    targetKind: safeTargetKind,
    targetPath: safeTargetPath
  });

  return {
    subject: {
      type: safeSubjectType,
      slug: safeSubjectSlug,
      title: resolved.title
    },
    target: {
      kind: safeTargetKind,
      path: safeTargetPath,
      label: resolved.label
    },
    currentBody: resolved.currentBody
  };
}

export async function createInformationRequest(request) {
  return writeInformationRequest({
    ...request,
    token: randomToken(),
    createdAt: new Date().toISOString(),
    deliveryStatus: {
      state: "pending",
      sentAt: "",
      error: ""
    },
    responseStatus: {
      state: "pending",
      receivedAt: "",
      appliedAt: "",
      applyError: ""
    },
    response: null
  });
}

export async function readInformationRequest(token) {
  const safeToken = assertInformationRequestToken(token);
  const file = await fs.readFile(requestPath(safeToken), "utf8");

  try {
    return normalizeInformationRequest(JSON.parse(file));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw requestError("Information request must be valid JSON.");
    }

    throw error;
  }
}

export async function listInformationRequests(filters = {}) {
  let files = [];

  try {
    files = await fs.readdir(INFORMATION_REQUESTS_DIR);
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
      const request = await readInformationRequest(token);

      if (filters.subjectType && request.subject.type !== filters.subjectType) {
        continue;
      }

      if (filters.subjectSlug && request.subject.slug !== filters.subjectSlug) {
        continue;
      }

      if (filters.channel && request.channel !== filters.channel) {
        continue;
      }

      if (filters.deliveryState && request.deliveryStatus.state !== filters.deliveryState) {
        continue;
      }

      if (filters.responseState && request.responseStatus.state !== filters.responseState) {
        continue;
      }

      requests.push(request);
    } catch {
      // Ignore stale or malformed request records; they should not break the tracker.
    }
  }

  return requests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function recordInformationRequestDelivery(token, delivery) {
  const request = await readInformationRequest(token);

  return writeInformationRequest({
    ...request,
    deliveryStatus: {
      state: delivery.state,
      sentAt: delivery.sentAt,
      error: delivery.error
    },
    provider: {
      ...request.provider,
      ...delivery.provider
    }
  });
}

export async function receiveInformationRequestResponse(token, response) {
  const request = await readInformationRequest(token);
  const body = String(response?.body ?? "").replace(/\r\n?/g, "\n").trim();
  const contributorName = boundedText("Contributor name", response?.contributorName, MAX_NAME_LENGTH);
  const receivedAt = new Date().toISOString();
  let appliedAt = "";
  let applyError = "";

  if (!body) {
    throw requestError("Information request response body cannot be empty.", 422);
  }

  try {
    await applyInformationResponse(request, body, contributorName);
    appliedAt = new Date().toISOString();
  } catch (error) {
    applyError = boundedText("Apply error", error?.message || "Response could not be applied.", MAX_DELIVERY_ERROR_LENGTH);
  }

  return writeInformationRequest({
    ...request,
    responseStatus: {
      state: applyError ? "apply-failed" : "applied",
      receivedAt,
      appliedAt,
      applyError
    },
    response: {
      contributorName,
      body,
      receivedAt,
      appliedAt,
      applyError
    }
  });
}
