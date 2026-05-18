import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

import { backupExistingFile } from "./backups.js";
import { PROJECT_FIELD_LIMITS, TEXT_LIMITS } from "./limits.js";

const PROJECTS_DIR = path.resolve(process.env.PROJECTS_DIR || path.join(process.cwd(), "data/projects"));
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const VISIBILITY_VALUES = new Set(["public", "private", "hidden"]);
const ASSET_SLOTS = new Set(["", "cover", "decisions", "outputs"]);

const TEXT_FIELDS = [
  "title",
  "subtitle",
  "year",
  "sector",
  "clientType",
  "role",
  "context",
  "challenge",
  "audience",
  "approach",
  "reflection",
  "confidentialityNotes"
];

function asText(value) {
  return String(value ?? "").trim();
}

function projectError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
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

function projectPath(slug) {
  return path.join(PROJECTS_DIR, `${assertProjectSlug(slug)}.json`);
}

function revisionFor(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function assertLength(label, value, maxLength) {
  if (value.length > maxLength) {
    throw projectError(`${label} must be ${maxLength} characters or fewer.`, 422);
  }
}

function normalizeStoryItems(value, titleKey = "title") {
  return asArray(value)
    .map(item => {
      if (typeof item === "string") {
        return {
          [titleKey]: asText(item),
          description: ""
        };
      }

      if (!item || typeof item !== "object") {
        return null;
      }

      return {
        [titleKey]: asText(item[titleKey] || item.title || item.metric),
        description: asText(item.description || item.body || item.summary)
      };
    })
    .filter(item => item && (item[titleKey] || item.description));
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

export function validateProject(project) {
  if (!project || typeof project !== "object") {
    throw projectError("Project data must be an object.", 422);
  }

  if (!project.title) {
    throw projectError("Title is required.", 422);
  }

  TEXT_FIELDS.forEach(field => {
    assertLength(field, project[field], PROJECT_FIELD_LIMITS[field]);
  });

  if (project.year && !/^\d{4}([-/]\d{2,4})?$/.test(project.year)) {
    throw projectError("Year must use YYYY or YYYY-YYYY format.", 422);
  }

  if (project.collaborators.length > TEXT_LIMITS.listItems) {
    throw projectError(`Collaborators can include at most ${TEXT_LIMITS.listItems} people or teams.`, 422);
  }

  project.collaborators.forEach(collaborator => {
    assertLength("Collaborator", collaborator, TEXT_LIMITS.short);
  });

  ["keyDecisions", "outputs", "impact"].forEach(field => {
    if (project[field].length > TEXT_LIMITS.listItems) {
      throw projectError(`${field} can include at most ${TEXT_LIMITS.listItems} items.`, 422);
    }
  });

  [...project.keyDecisions, ...project.outputs].forEach(item => {
    assertLength("Item title", item.title, PROJECT_FIELD_LIMITS.titleListTitle);
    assertLength("Item description", item.description, PROJECT_FIELD_LIMITS.titleListDescription);
  });

  project.impact.forEach(item => {
    assertLength("Impact metric", item.metric, PROJECT_FIELD_LIMITS.impactMetric);
    assertLength("Impact description", item.description, PROJECT_FIELD_LIMITS.titleListDescription);
  });

  if (project.assets.length > TEXT_LIMITS.assets) {
    throw projectError(`Assets can include at most ${TEXT_LIMITS.assets} images.`, 422);
  }

  project.assets.forEach(asset => {
    assertLength("Asset path", asset.path, TEXT_LIMITS.path);
    assertLength("Asset caption", asset.caption, TEXT_LIMITS.long);

    if (!VISIBILITY_VALUES.has(asset.visibility)) {
      throw projectError("Asset visibility must be public, private or hidden.", 422);
    }

    if (!ASSET_SLOTS.has(asset.slot)) {
      throw projectError("Asset slot must be cover, decisions or outputs.", 422);
    }

    if (asset.path) {
      if (!asset.path.startsWith("/assets/")) {
        throw projectError("Asset paths must point to local /assets/ files.", 422);
      }

      if (asset.path.includes("..") || asset.path.includes("\\")) {
        throw projectError("Asset path cannot contain directory traversal.", 422);
      }
    }
  });

  return project;
}

export function assertProjectSlug(slug) {
  const normalized = String(slug ?? "").trim();

  if (!SLUG_PATTERN.test(normalized)) {
    throw projectError("Project slug must use lowercase letters, numbers and hyphens.");
  }

  return normalized;
}

export function slugFromTitle(title) {
  const slug = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled-project";
}

export function normalizeProject(project) {
  const normalized = {};

  TEXT_FIELDS.forEach(field => {
    normalized[field] = asText(project?.[field]);
  });

  normalized.collaborators = asArray(project?.collaborators).map(asText).filter(Boolean);
  normalized.keyDecisions = normalizeStoryItems(project?.keyDecisions, "title");
  normalized.outputs = normalizeStoryItems(project?.outputs, "title");
  normalized.impact = normalizeStoryItems(project?.impact, "metric");
  normalized.assets = normalizeAssets(project?.assets);

  return validateProject(normalized);
}

export function blankProject(overrides = {}) {
  return normalizeProject({
    title: "Untitled case study",
    subtitle: "",
    year: String(new Date().getFullYear()),
    sector: "",
    clientType: "",
    role: "",
    collaborators: [],
    context: "",
    challenge: "",
    audience: "",
    approach: "",
    keyDecisions: [],
    outputs: [],
    impact: [],
    reflection: "",
    confidentialityNotes: "",
    assets: [],
    ...overrides
  });
}

export async function listProjects() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const files = await fs.readdir(PROJECTS_DIR);
  const projects = [];

  for (const file of files.filter(file => file.endsWith(".json")).sort()) {
    const slug = file.replace(/\.json$/, "");

    if (!SLUG_PATTERN.test(slug)) {
      continue;
    }

    try {
      const project = await readProject(slug);
      projects.push({
        slug,
        title: project.title || slug,
        subtitle: project.subtitle,
        year: project.year,
        sector: project.sector
      });
    } catch {
      projects.push({
        slug,
        title: slug,
        subtitle: "Could not read project JSON.",
        year: "",
        sector: ""
      });
    }
  }

  return projects;
}

export async function readProject(slug) {
  return (await readProjectRecord(slug)).project;
}

export async function readProjectRecord(slug) {
  const safeSlug = assertProjectSlug(slug);
  const file = await fs.readFile(projectPath(safeSlug), "utf8");
  let parsed;

  try {
    parsed = JSON.parse(file);
  } catch {
    throw projectError(`Project JSON for "${safeSlug}" must be valid JSON.`);
  }

  return {
    project: normalizeProject(parsed),
    revision: revisionFor(file)
  };
}

export async function saveProjectRecord(slug, project, expectedRevision) {
  const safeSlug = assertProjectSlug(slug);
  const normalized = normalizeProject(project);
  const filePath = projectPath(safeSlug);

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
      throw projectError("Project changed on disk. Reload before saving again.", 409);
    }
  }

  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await backupExistingFile(filePath, path.join("data/projects", `${safeSlug}.json`));
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);

  return {
    project: normalized,
    revision: revisionFor(contents)
  };
}

export async function saveProject(slug, project, expectedRevision) {
  return (await saveProjectRecord(slug, project, expectedRevision)).project;
}
