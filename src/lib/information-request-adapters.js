import {
  assertBdDocumentSlug,
  readBdDocument,
  readBdDocumentRecord,
  saveBdDocumentRecord
} from "./bd-documents.js";
import {
  assertEngineeringReportPageKind,
  assertEngineeringReportSlug,
  findEngineeringReportSection,
  findEngineeringReportSubsection,
  readEngineeringReport,
  saveEngineeringReportSectionDraft,
  saveEngineeringReportSubsectionDraft
} from "./engineering-reports.js";
import {
  assertProjectSlug,
  readProject,
  readProjectRecord,
  saveProjectRecord
} from "./projects.js";

const MAX_PATH_LENGTH = 240;
const TARGET_KINDS = new Set(["field", "list-item", "section", "subsection"]);

const PROJECT_TEXT_FIELDS = new Set([
  "title",
  "subtitle",
  "year",
  "sector",
  "clientType",
  "role",
  "collaborators",
  "context",
  "challenge",
  "audience",
  "approach",
  "reflection",
  "confidentialityNotes"
]);
const PROJECT_LIST_FIELDS = new Map([
  ["keyDecisions", new Set(["title", "description"])],
  ["outputs", new Set(["title", "description"])],
  ["impact", new Set(["metric", "unit", "description"])]
]);
const BD_TEXT_FIELDS = new Set([
  "title",
  "subtitle",
  "year",
  "audience",
  "positioning",
  "executivePromise",
  "processSummary",
  "nextSteps",
  "primaryCta",
  "secondaryCta",
  "confidentialityNotes"
]);
const BD_LIST_FIELDS = new Map([
  ["buyerProblems", new Set(["title", "description"])],
  ["offerPillars", new Set(["title", "description", "deliverables"])],
  ["process", new Set(["title", "description"])],
  ["proofSections", new Set(["headline", "clientContext", "problem", "intervention", "outcome", "evidence"])],
  ["engagementModels", new Set(["title", "bestFor", "scope", "timeline"])]
]);

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asText(value) {
  return String(value ?? "").trim();
}

function boundedTargetPath(value) {
  const text = asText(value);

  if (text.length > MAX_PATH_LENGTH) {
    throw requestError(`Request target path must be ${MAX_PATH_LENGTH} characters or fewer.`, 422);
  }

  return text;
}

function parseTargetPath(pathValue) {
  const parts = asText(pathValue).split(".").filter(Boolean);

  if (parts.some(part => ["__proto__", "prototype", "constructor"].includes(part))) {
    throw requestError("Request target path is invalid.", 422);
  }

  return parts;
}

function listTargetValue(document, pathValue, listFields, textFields) {
  const parts = parseTargetPath(pathValue);

  if (parts.length === 1) {
    if (!textFields.has(parts[0])) {
      throw requestError("Request target field is not supported.", 422);
    }

    const value = document[parts[0]];

    return Array.isArray(value) ? value.join("\n") : asText(value);
  }

  if (parts.length !== 3) {
    throw requestError("Request target path is invalid.", 422);
  }

  const [listName, indexValue, fieldName] = parts;
  const fields = listFields.get(listName);
  const index = Number(indexValue);

  if (!fields?.has(fieldName) || !Number.isInteger(index) || index < 0 || !Array.isArray(document[listName]) || !document[listName][index]) {
    throw requestError("Request target list item is not supported.", 422);
  }

  const value = document[listName][index][fieldName];

  return Array.isArray(value) ? value.join("\n") : asText(value);
}

function setTargetValue(document, pathValue, body, listFields, textFields) {
  const parts = parseTargetPath(pathValue);

  if (parts.length === 1) {
    if (!textFields.has(parts[0])) {
      throw requestError("Request target field is not supported.", 422);
    }

    document[parts[0]] = body;
    return;
  }

  if (parts.length !== 3) {
    throw requestError("Request target path is invalid.", 422);
  }

  const [listName, indexValue, fieldName] = parts;
  const fields = listFields.get(listName);
  const index = Number(indexValue);

  if (!fields?.has(fieldName) || !Number.isInteger(index) || index < 0 || !Array.isArray(document[listName]) || !document[listName][index]) {
    throw requestError("Request target list item is not supported.", 422);
  }

  document[listName][index][fieldName] = fieldName === "deliverables"
    ? body.split(/\n+/).map(item => item.trim()).filter(Boolean)
    : body;
}

function fieldLabelFromPath(pathValue) {
  const parts = parseTargetPath(pathValue);

  if (parts.length === 1) {
    return parts[0].replace(/([A-Z])/g, " $1").replace(/^./, match => match.toUpperCase());
  }

  if (parts.length === 3) {
    return `${parts[0]} item ${Number(parts[1]) + 1} ${parts[2]}`;
  }

  return pathValue;
}

async function projectTarget(subjectSlug, targetPath) {
  const project = await readProject(subjectSlug);

  return {
    title: project.title || subjectSlug,
    label: fieldLabelFromPath(targetPath),
    currentBody: listTargetValue(project, targetPath, PROJECT_LIST_FIELDS, PROJECT_TEXT_FIELDS)
  };
}

async function bdTarget(subjectSlug, targetPath) {
  const document = await readBdDocument(subjectSlug);

  return {
    title: document.title || subjectSlug,
    label: fieldLabelFromPath(targetPath),
    currentBody: listTargetValue(document, targetPath, BD_LIST_FIELDS, BD_TEXT_FIELDS)
  };
}

async function engineeringTarget(subjectSlug, kind, targetPath) {
  const report = await readEngineeringReport(subjectSlug);
  const target = kind === "section"
    ? findEngineeringReportSection(report, targetPath)
    : findEngineeringReportSubsection(report, targetPath);
  const label = [
    kind === "section" ? "Section" : "Subsection",
    target.number,
    target.title
  ].filter(Boolean).join(" ");

  return {
    title: report.title || subjectSlug,
    label,
    currentBody: asText(target.draft?.body)
  };
}

async function applyProjectResponse(request, body) {
  const record = await readProjectRecord(request.subject.slug);

  setTargetValue(record.project, request.target.path, body, PROJECT_LIST_FIELDS, PROJECT_TEXT_FIELDS);
  await saveProjectRecord(request.subject.slug, record.project, "*");
}

async function applyBdResponse(request, body) {
  const record = await readBdDocumentRecord(request.subject.slug);

  setTargetValue(record.document, request.target.path, body, BD_LIST_FIELDS, BD_TEXT_FIELDS);
  await saveBdDocumentRecord(request.subject.slug, record.document, "*");
}

async function applyEngineeringResponse(request, body, contributorName) {
  if (request.target.kind === "section") {
    await saveEngineeringReportSectionDraft(request.subject.slug, request.target.path, { body });
    return;
  }

  if (request.target.kind === "subsection") {
    await saveEngineeringReportSubsectionDraft(request.subject.slug, request.target.path, {
      body,
      owner: contributorName || request.recipients[0]?.name || request.recipients[0]?.email,
      status: "review"
    });
    return;
  }

  throw requestError("Engineering report requests must target a section or subsection.", 422);
}

const INFORMATION_REQUEST_ADAPTERS = new Map([
  ["project", {
    targetKinds: new Set(["field", "list-item"]),
    assertSlug: assertProjectSlug,
    assertTargetPath: boundedTargetPath,
    resolveTarget: ({ subjectSlug, targetPath }) => projectTarget(subjectSlug, targetPath),
    applyResponse: applyProjectResponse
  }],
  ["bd-document", {
    targetKinds: new Set(["field", "list-item"]),
    assertSlug: assertBdDocumentSlug,
    assertTargetPath: boundedTargetPath,
    resolveTarget: ({ subjectSlug, targetPath }) => bdTarget(subjectSlug, targetPath),
    applyResponse: applyBdResponse
  }],
  ["engineering-report", {
    targetKinds: new Set(["section", "subsection"]),
    assertSlug: assertEngineeringReportSlug,
    assertTargetPath: (targetPath, targetKind) => {
      assertEngineeringReportPageKind(targetKind);
      return assertEngineeringReportSlug(targetPath);
    },
    resolveTarget: ({ subjectSlug, targetKind, targetPath }) => engineeringTarget(subjectSlug, targetKind, targetPath),
    applyResponse: applyEngineeringResponse
  }]
]);

export const INFORMATION_SUBJECT_TYPES = new Set(INFORMATION_REQUEST_ADAPTERS.keys());
export const INFORMATION_TARGET_KINDS = new Set(TARGET_KINDS);

function adapterFor(subjectType) {
  const adapter = INFORMATION_REQUEST_ADAPTERS.get(asText(subjectType));

  if (!adapter) {
    throw requestError("Request subject type is invalid.", 422);
  }

  return adapter;
}

export function assertInformationSubjectSlug(subjectType, slug) {
  return adapterFor(subjectType).assertSlug(slug);
}

export function assertInformationTargetPath(subjectType, targetKind, targetPath) {
  const adapter = adapterFor(subjectType);
  const kind = asText(targetKind);

  if (!TARGET_KINDS.has(kind) || !adapter.targetKinds.has(kind)) {
    throw requestError("Request target kind is not supported by this subject.", 422);
  }

  const safePath = adapter.assertTargetPath(targetPath, kind);

  if (!safePath) {
    throw requestError("Request target path is required.", 422);
  }

  return safePath;
}

export async function resolveInformationTarget({ subjectType, subjectSlug, targetKind, targetPath }) {
  const adapter = adapterFor(subjectType);

  return adapter.resolveTarget({ subjectSlug, targetKind, targetPath });
}

export async function applyInformationResponse(request, body, contributorName) {
  return adapterFor(request.subject.type).applyResponse(request, body, contributorName);
}
