import fs from "node:fs/promises";
import path from "node:path";

const PROJECTS_DIR = path.resolve(process.cwd(), "data/projects");
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

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
  normalized.keyDecisions = asArray(project?.keyDecisions);
  normalized.outputs = asArray(project?.outputs);
  normalized.impact = asArray(project?.impact);
  normalized.assets = normalizeAssets(project?.assets);

  return normalized;
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
  const safeSlug = assertProjectSlug(slug);
  const filePath = path.join(PROJECTS_DIR, `${safeSlug}.json`);
  const file = await fs.readFile(filePath, "utf8");

  try {
    return normalizeProject(JSON.parse(file));
  } catch {
    throw projectError(`Project JSON for "${safeSlug}" must be valid JSON.`);
  }
}

export async function saveProject(slug, project) {
  const safeSlug = assertProjectSlug(slug);
  const normalized = normalizeProject(project);
  const filePath = path.join(PROJECTS_DIR, `${safeSlug}.json`);

  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return normalized;
}
