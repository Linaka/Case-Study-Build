import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

import { backupExistingFile } from "./backups.js";
import { BD_FIELD_LIMITS, TEXT_LIMITS } from "./limits.js";
import { assertProjectSlug } from "./projects.js";

const BD_DOCUMENTS_DIR = path.resolve(process.env.BD_DOCUMENTS_DIR || path.join(process.cwd(), "data/bd-documents"));
const VISIBILITY_VALUES = new Set(["public", "private", "hidden"]);
const ASSET_SLOTS = new Set(["", "cover"]);

const TEXT_FIELDS = [
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
];

function asText(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== null && item !== undefined);
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(/\n+/).map(item => item.trim()).filter(Boolean);
  }

  return [];
}

function bdDocumentError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function bdDocumentPath(slug) {
  return path.join(BD_DOCUMENTS_DIR, `${assertBdDocumentSlug(slug)}.json`);
}

function revisionFor(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function assertLength(label, value, maxLength) {
  if (value.length > maxLength) {
    throw bdDocumentError(`${label} must be ${maxLength} characters or fewer.`, 422);
  }
}

function assertAssetPath(label, value) {
  if (!value) {
    return;
  }

  if (!value.startsWith("/assets/")) {
    throw bdDocumentError(`${label} must point to a local /assets/ file.`, 422);
  }

  if (value.includes("..") || value.includes("\\")) {
    throw bdDocumentError(`${label} cannot contain directory traversal.`, 422);
  }
}

function titleDescriptionList(value) {
  return asArray(value)
    .filter(item => item && typeof item === "object")
    .map(item => ({
      title: asText(item.title),
      description: asText(item.description)
    }))
    .filter(item => item.title || item.description);
}

function normalizeOfferPillars(value) {
  return asArray(value)
    .filter(item => item && typeof item === "object")
    .map(item => ({
      title: asText(item.title),
      description: asText(item.description),
      deliverables: asArray(item.deliverables).map(asText).filter(Boolean)
    }))
    .filter(item => item.title || item.description || item.deliverables.length);
}

function normalizeProofSections(value) {
  return asArray(value)
    .filter(item => item && typeof item === "object")
    .map(item => ({
      headline: asText(item.headline),
      clientContext: asText(item.clientContext),
      problem: asText(item.problem),
      intervention: asText(item.intervention),
      outcome: asText(item.outcome),
      evidence: asText(item.evidence),
      projectSlug: asText(item.projectSlug),
      assetPath: asText(item.assetPath),
      visibility: asText(item.visibility || "private") || "private"
    }))
    .filter(item => item.headline || item.problem || item.intervention || item.outcome || item.evidence || item.assetPath);
}

function normalizeEngagementModels(value) {
  return asArray(value)
    .filter(item => item && typeof item === "object")
    .map(item => ({
      title: asText(item.title),
      bestFor: asText(item.bestFor),
      scope: asText(item.scope),
      timeline: asText(item.timeline)
    }))
    .filter(item => item.title || item.bestFor || item.scope || item.timeline);
}

function normalizeAssets(value) {
  return asArray(value)
    .filter(asset => asset && typeof asset === "object")
    .map(asset => ({
      path: asText(asset.path),
      caption: asText(asset.caption),
      visibility: asText(asset.visibility || "public") || "public",
      slot: asText(asset.slot)
    }))
    .filter(asset => asset.path || asset.caption);
}

export function assertBdDocumentSlug(slug) {
  return assertProjectSlug(slug);
}

export function validateBdDocument(document) {
  if (!document || typeof document !== "object") {
    throw bdDocumentError("Business development document data must be an object.", 422);
  }

  if (!document.title) {
    throw bdDocumentError("Title is required.", 422);
  }

  TEXT_FIELDS.forEach(field => {
    assertLength(field, document[field], BD_FIELD_LIMITS[field]);
  });

  if (document.year && !/^\d{4}([-/]\d{2,4})?$/.test(document.year)) {
    throw bdDocumentError("Year must use YYYY or YYYY-YYYY format.", 422);
  }

  ["buyerProblems", "offerPillars", "process", "proofSections", "engagementModels"].forEach(field => {
    if (document[field].length > TEXT_LIMITS.listItems) {
      throw bdDocumentError(`${field} can include at most ${TEXT_LIMITS.listItems} items.`, 422);
    }
  });

  [...document.buyerProblems, ...document.process].forEach(item => {
    assertLength("Item title", item.title, BD_FIELD_LIMITS.titleListTitle);
    assertLength("Item description", item.description, BD_FIELD_LIMITS.titleListDescription);
  });

  document.offerPillars.forEach(item => {
    assertLength("Offer pillar title", item.title, BD_FIELD_LIMITS.offerTitle);
    assertLength("Offer pillar description", item.description, BD_FIELD_LIMITS.offerDescription);

    if (item.deliverables.length > TEXT_LIMITS.listItems) {
      throw bdDocumentError(`Offer pillar deliverables can include at most ${TEXT_LIMITS.listItems} items.`, 422);
    }

    item.deliverables.forEach(deliverable => {
      assertLength("Offer pillar deliverable", deliverable, TEXT_LIMITS.label);
    });
  });

  document.proofSections.forEach(proof => {
    assertLength("Proof headline", proof.headline, BD_FIELD_LIMITS.proofHeadline);
    assertLength("Proof clientContext", proof.clientContext, BD_FIELD_LIMITS.proofClientContext);
    assertLength("Proof projectSlug", proof.projectSlug, BD_FIELD_LIMITS.proofProjectSlug);
    assertLength("Proof problem", proof.problem, BD_FIELD_LIMITS.proofProblem);
    assertLength("Proof intervention", proof.intervention, BD_FIELD_LIMITS.proofIntervention);
    assertLength("Proof outcome", proof.outcome, BD_FIELD_LIMITS.proofOutcome);
    assertLength("Proof evidence", proof.evidence, BD_FIELD_LIMITS.proofEvidence);

    if (proof.projectSlug) {
      assertBdDocumentSlug(proof.projectSlug);
    }

    if (!VISIBILITY_VALUES.has(proof.visibility)) {
      throw bdDocumentError("Proof visibility must be public, private or hidden.", 422);
    }

    assertAssetPath("Proof asset path", proof.assetPath);
  });

  document.engagementModels.forEach(model => {
    assertLength("Engagement model title", model.title, BD_FIELD_LIMITS.engagementTitle);
    assertLength("Engagement model timeline", model.timeline, BD_FIELD_LIMITS.engagementTimeline);
    assertLength("Engagement model bestFor", model.bestFor, BD_FIELD_LIMITS.engagementBestFor);
    assertLength("Engagement model scope", model.scope, BD_FIELD_LIMITS.engagementScope);
  });

  if (document.assets.length > TEXT_LIMITS.assets) {
    throw bdDocumentError(`Assets can include at most ${TEXT_LIMITS.assets} images.`, 422);
  }

  document.assets.forEach(asset => {
    assertLength("Asset path", asset.path, TEXT_LIMITS.path);
    assertLength("Asset caption", asset.caption, TEXT_LIMITS.long);

    if (!VISIBILITY_VALUES.has(asset.visibility)) {
      throw bdDocumentError("Asset visibility must be public, private or hidden.", 422);
    }

    if (!ASSET_SLOTS.has(asset.slot)) {
      throw bdDocumentError("Asset slot must be cover.", 422);
    }

    assertAssetPath("Asset path", asset.path);
  });

  return document;
}

export function normalizeBdDocument(document) {
  const normalized = {};

  TEXT_FIELDS.forEach(field => {
    normalized[field] = asText(document?.[field]);
  });

  normalized.buyerProblems = titleDescriptionList(document?.buyerProblems);
  normalized.offerPillars = normalizeOfferPillars(document?.offerPillars);
  normalized.process = titleDescriptionList(document?.process);
  normalized.proofSections = normalizeProofSections(document?.proofSections);
  normalized.engagementModels = normalizeEngagementModels(document?.engagementModels);
  normalized.assets = normalizeAssets(document?.assets);

  return validateBdDocument(normalized);
}

export function blankBdDocument(overrides = {}) {
  return normalizeBdDocument({
    title: "Enterprise product build support",
    subtitle: "",
    year: String(new Date().getFullYear()),
    audience: "Enterprise product, innovation and operations leads",
    positioning: "",
    executivePromise: "",
    buyerProblems: [],
    offerPillars: [],
    processSummary: "",
    process: [],
    proofSections: [],
    engagementModels: [],
    nextSteps: "",
    primaryCta: "",
    secondaryCta: "",
    confidentialityNotes: "",
    assets: [],
    ...overrides
  });
}

export async function listBdDocuments() {
  await fs.mkdir(BD_DOCUMENTS_DIR, { recursive: true });
  const files = await fs.readdir(BD_DOCUMENTS_DIR);
  const documents = [];

  for (const file of files.filter(file => file.endsWith(".json")).sort()) {
    const slug = file.replace(/\.json$/, "");

    try {
      const document = await readBdDocument(slug);
      documents.push({
        slug,
        title: document.title || slug,
        subtitle: document.subtitle,
        year: document.year,
        audience: document.audience
      });
    } catch {
      documents.push({
        slug,
        title: slug,
        subtitle: "Could not read business development JSON.",
        year: "",
        audience: ""
      });
    }
  }

  return documents;
}

export async function readBdDocument(slug) {
  return (await readBdDocumentRecord(slug)).document;
}

export async function readBdDocumentRecord(slug) {
  const safeSlug = assertBdDocumentSlug(slug);
  const file = await fs.readFile(bdDocumentPath(safeSlug), "utf8");
  let parsed;

  try {
    parsed = JSON.parse(file);
  } catch {
    throw bdDocumentError(`Business development JSON for "${safeSlug}" must be valid JSON.`);
  }

  return {
    document: normalizeBdDocument(parsed),
    revision: revisionFor(file)
  };
}

export async function saveBdDocumentRecord(slug, document, expectedRevision) {
  const safeSlug = assertBdDocumentSlug(slug);
  const normalized = normalizeBdDocument(document);
  const filePath = bdDocumentPath(safeSlug);

  if (expectedRevision && expectedRevision !== "*") {
    let currentRevision = "new";

    try {
      currentRevision = revisionFor(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (currentRevision !== expectedRevision) {
      throw bdDocumentError("Business development document changed on disk. Reload before saving again.", 409);
    }
  }

  await fs.mkdir(BD_DOCUMENTS_DIR, { recursive: true });
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await backupExistingFile(filePath, path.join("data/bd-documents", `${safeSlug}.json`));
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);

  return {
    document: normalized,
    revision: revisionFor(contents)
  };
}

export async function saveBdDocument(slug, document, expectedRevision) {
  return (await saveBdDocumentRecord(slug, document, expectedRevision)).document;
}
