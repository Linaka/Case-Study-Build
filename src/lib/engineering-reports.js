import fs from "node:fs/promises";
import path from "node:path";

import { backupExistingFile } from "./backups.js";
import { assertProjectSlug } from "./projects.js";

const ENGINEERING_REPORTS_DIR = path.resolve(process.env.ENGINEERING_REPORTS_DIR || path.join(process.cwd(), "data/engineering-reports"));
const ENGINEERING_REPORT_IMAGES_DIR = path.resolve(process.env.ENGINEERING_REPORT_IMAGES_DIR || path.join(process.cwd(), "data/engineering-report-images"));
const ENGINEERING_REPORT_SPREADSHEETS_DIR = path.resolve(process.env.ENGINEERING_REPORT_SPREADSHEETS_DIR || path.join(process.cwd(), "data/engineering-report-spreadsheets"));
const ENGINEERING_REPORT_SUBSECTIONS_DIR = path.resolve(process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR || path.join(process.cwd(), "data/engineering-report-subsections"));
const ENGINEERING_REPORT_ORDER_DIR = path.resolve(process.env.ENGINEERING_REPORT_ORDER_DIR || path.join(process.cwd(), "data/engineering-report-orders"));
const DEFAULT_REPORT_SLUG = "stage-2-basis-of-design";
const PAGE_KINDS = new Set(["section", "subsection"]);
const SUBSECTION_STATUSES = new Set(["not-started", "drafting", "review", "approved"]);
const MAX_SUBSECTION_BODY_LENGTH = 60_000;
const MAX_SECTION_BODY_LENGTH = 60_000;

function asText(value) {
  return String(value ?? "").trim();
}

function reportError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function slugFromText(value, fallback = "item") {
  const slug = asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function uniqueSlug(baseSlug, usedSlugs) {
  let slug = baseSlug;
  let index = 2;

  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }

  usedSlugs.add(slug);
  return slug;
}

function stripHeading(line) {
  return asText(line.replace(/^#{1,6}\s+/, ""));
}

function meaningfulLines(lines) {
  return lines.map(line => line.trim()).filter(line => line && line !== "---");
}

function reportPath(slug) {
  return path.join(ENGINEERING_REPORTS_DIR, `${assertEngineeringReportSlug(slug)}.md`);
}

function imageManifestPath(slug) {
  return path.join(ENGINEERING_REPORT_IMAGES_DIR, `${assertEngineeringReportSlug(slug)}.json`);
}

function subsectionManifestPath(slug) {
  return path.join(ENGINEERING_REPORT_SUBSECTIONS_DIR, `${assertEngineeringReportSlug(slug)}.json`);
}

function orderManifestPath(slug) {
  return path.join(ENGINEERING_REPORT_ORDER_DIR, `${assertEngineeringReportSlug(slug)}.json`);
}

function pageKey(kind, slug) {
  const safeKind = assertEngineeringReportPageKind(kind);
  const safeSlug = assertEngineeringReportSlug(slug);

  return `${safeKind}:${safeSlug}`;
}

function normalizeImage(image) {
  return {
    path: asText(image?.path),
    caption: asText(image?.caption),
    copyright: asText(image?.copyright || image?.credit || image?.rights),
    fileName: asText(image?.fileName),
    type: asText(image?.type),
    size: Number.isFinite(Number(image?.size)) ? Number(image.size) : 0,
    addedAt: asText(image?.addedAt) || new Date().toISOString()
  };
}

function normalizeSpreadsheet(spreadsheet) {
  return {
    path: asText(spreadsheet?.path),
    caption: asText(spreadsheet?.caption),
    fileName: asText(spreadsheet?.fileName),
    type: asText(spreadsheet?.type),
    size: Number.isFinite(Number(spreadsheet?.size)) ? Number(spreadsheet.size) : 0,
    addedAt: asText(spreadsheet?.addedAt) || new Date().toISOString()
  };
}

function blankSectionDraft() {
  return {
    body: "",
    updatedAt: ""
  };
}

function blankSubsectionDraft() {
  return {
    body: "",
    status: "not-started",
    owner: "",
    updatedAt: ""
  };
}

function normalizeSectionBody(value) {
  const body = String(value ?? "").replace(/\r\n?/g, "\n").trim();

  if (body.length > MAX_SECTION_BODY_LENGTH) {
    throw reportError(`Engineering report section copy must be ${MAX_SECTION_BODY_LENGTH} characters or fewer.`);
  }

  return body;
}

function normalizeSectionDraft(draft = {}) {
  return {
    body: normalizeSectionBody(draft.body),
    updatedAt: asText(draft.updatedAt)
  };
}

function normalizeSubsectionBody(value) {
  const body = String(value ?? "").replace(/\r\n?/g, "\n").trim();

  if (body.length > MAX_SUBSECTION_BODY_LENGTH) {
    throw reportError(`Engineering report subsection copy must be ${MAX_SUBSECTION_BODY_LENGTH} characters or fewer.`);
  }

  return body;
}

function normalizeSubsectionDraft(draft = {}) {
  const status = asText(draft.status);

  return {
    body: normalizeSubsectionBody(draft.body),
    status: SUBSECTION_STATUSES.has(status) ? status : "not-started",
    owner: asText(draft.owner).slice(0, 120),
    updatedAt: asText(draft.updatedAt)
  };
}

function normalizeSubsectionManifest(manifest) {
  const sections = {};
  const subsections = {};

  Object.entries(manifest?.sections || {}).forEach(([slug, draft]) => {
    try {
      const safeSlug = assertEngineeringReportSlug(slug);
      const normalized = normalizeSectionDraft(draft);

      if (normalized.body || normalized.updatedAt) {
        sections[safeSlug] = normalized;
      }
    } catch {
      // Ignore stale keys from deleted or renamed outline items.
    }
  });

  Object.entries(manifest?.subsections || {}).forEach(([slug, draft]) => {
    try {
      const safeSlug = assertEngineeringReportSlug(slug);
      const normalized = normalizeSubsectionDraft(draft);

      if (normalized.body || normalized.owner || normalized.updatedAt || normalized.status !== "not-started") {
        subsections[safeSlug] = normalized;
      }
    } catch {
      // Ignore stale keys from deleted or renamed outline items.
    }
  });

  return { sections, subsections };
}

function normalizeSlugList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const slugs = [];
  const seen = new Set();

  value.forEach(slug => {
    try {
      const safeSlug = assertEngineeringReportSlug(slug);

      if (!seen.has(safeSlug)) {
        slugs.push(safeSlug);
        seen.add(safeSlug);
      }
    } catch {
      // Ignore stale or malformed order entries.
    }
  });

  return slugs;
}

function normalizeOrderManifest(manifest) {
  const subsectionsBySectionSlug = {};

  Object.entries(manifest?.subsectionsBySectionSlug || {}).forEach(([sectionSlug, subsectionSlugs]) => {
    try {
      const safeSectionSlug = assertEngineeringReportSlug(sectionSlug);
      const safeSubsectionSlugs = normalizeSlugList(subsectionSlugs);

      if (safeSubsectionSlugs.length) {
        subsectionsBySectionSlug[safeSectionSlug] = safeSubsectionSlugs;
      }
    } catch {
      // Ignore stale section keys from older outlines.
    }
  });

  return {
    groupSlugs: normalizeSlugList(manifest?.groupSlugs),
    subsectionsBySectionSlug
  };
}

function normalizeManifest(manifest) {
  const pages = {};

  Object.entries(manifest?.pages || {}).forEach(([key, images]) => {
    if (!Array.isArray(images)) {
      return;
    }

    pages[key] = images
      .map(normalizeImage)
      .filter(image => image.path.startsWith("/assets/engineering-reports/"));
  });

  return { pages };
}

function normalizeSpreadsheetManifest(manifest) {
  const pages = {};

  Object.entries(manifest?.pages || {}).forEach(([key, spreadsheets]) => {
    if (!Array.isArray(spreadsheets)) {
      return;
    }

    pages[key] = spreadsheets
      .map(normalizeSpreadsheet)
      .filter(spreadsheet => spreadsheet.path.startsWith("/assets/engineering-reports/"));
  });

  return { pages };
}

async function readSubsectionManifest(slug) {
  try {
    const file = await fs.readFile(subsectionManifestPath(slug), "utf8");
    return normalizeSubsectionManifest(JSON.parse(file));
  } catch (error) {
    if (error.code === "ENOENT") {
      return { sections: {}, subsections: {} };
    }

    if (error instanceof SyntaxError) {
      throw reportError(`Engineering report subsection manifest for "${slug}" must be valid JSON.`);
    }

    throw error;
  }
}

async function readSpreadsheetManifest(slug) {
  try {
    const file = await fs.readFile(path.join(ENGINEERING_REPORT_SPREADSHEETS_DIR, `${assertEngineeringReportSlug(slug)}.json`), "utf8");
    return normalizeSpreadsheetManifest(JSON.parse(file));
  } catch (error) {
    if (error.code === "ENOENT") {
      return { pages: {} };
    }

    if (error instanceof SyntaxError) {
      throw reportError(`Engineering report spreadsheet manifest for "${slug}" must be valid JSON.`);
    }

    throw error;
  }
}

async function readOrderManifest(slug) {
  try {
    const file = await fs.readFile(orderManifestPath(slug), "utf8");
    return normalizeOrderManifest(JSON.parse(file));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeOrderManifest({});
    }

    if (error instanceof SyntaxError) {
      throw reportError(`Engineering report order manifest for "${slug}" must be valid JSON.`);
    }

    throw error;
  }
}

async function readImageManifest(slug) {
  try {
    const file = await fs.readFile(imageManifestPath(slug), "utf8");
    return normalizeManifest(JSON.parse(file));
  } catch (error) {
    if (error.code === "ENOENT") {
      return { pages: {} };
    }

    if (error instanceof SyntaxError) {
      throw reportError(`Engineering report image manifest for "${slug}" must be valid JSON.`);
    }

    throw error;
  }
}

async function writeOrderManifest(slug, manifest) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const filePath = orderManifestPath(safeSlug);
  const normalized = normalizeOrderManifest(manifest);
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(ENGINEERING_REPORT_ORDER_DIR, { recursive: true });
  await backupExistingFile(filePath, path.join("data/engineering-report-orders", `${safeSlug}.json`));
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);

  return normalized;
}

async function writeSubsectionManifest(slug, manifest) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const filePath = subsectionManifestPath(safeSlug);
  const normalized = normalizeSubsectionManifest(manifest);
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(ENGINEERING_REPORT_SUBSECTIONS_DIR, { recursive: true });
  await backupExistingFile(filePath, path.join("data/engineering-report-subsections", `${safeSlug}.json`));
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);

  return normalized;
}

async function writeImageManifest(slug, manifest) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const filePath = imageManifestPath(safeSlug);
  const normalized = normalizeManifest(manifest);
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(ENGINEERING_REPORT_IMAGES_DIR, { recursive: true });
  await backupExistingFile(filePath, path.join("data/engineering-report-images", `${safeSlug}.json`));
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);

  return normalized;
}

async function writeSpreadsheetManifest(slug, manifest) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const filePath = path.join(ENGINEERING_REPORT_SPREADSHEETS_DIR, `${safeSlug}.json`);
  const normalized = normalizeSpreadsheetManifest(manifest);
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(ENGINEERING_REPORT_SPREADSHEETS_DIR, { recursive: true });
  await backupExistingFile(filePath, path.join("data/engineering-report-spreadsheets", `${safeSlug}.json`));
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);

  return normalized;
}

function orderedItems(items, orderedSlugs) {
  const itemBySlug = new Map(items.map(item => [item.slug, item]));
  const ordered = [];
  const used = new Set();

  orderedSlugs.forEach(slug => {
    const item = itemBySlug.get(slug);

    if (item && !used.has(slug)) {
      ordered.push(item);
      used.add(slug);
    }
  });

  items.forEach(item => {
    if (!used.has(item.slug)) {
      ordered.push(item);
    }
  });

  return ordered;
}

function refreshReportFlatLists(report) {
  report.sections = report.groups.flatMap(group => group.sections);
  report.subsections = report.sections.flatMap(section => section.subsections);
  report.sectionCount = report.sections.length;
  report.subsectionCount = report.subsections.length;

  return report;
}

function applyOrder(report, manifest) {
  report.groups = orderedItems(report.groups, manifest.groupSlugs);

  report.groups.forEach(group => {
    group.sections.forEach(section => {
      section.subsections = orderedItems(section.subsections, manifest.subsectionsBySectionSlug[section.slug] || []);
    });
  });

  return refreshReportFlatLists(report);
}

function attachSubsectionDrafts(report, manifest) {
  report.sections.forEach(section => {
    section.draft = manifest.sections[section.slug] || blankSectionDraft();
    section.subsections.forEach(subsection => {
      subsection.draft = manifest.subsections[subsection.slug] || blankSubsectionDraft();
    });
  });

  return report;
}

function attachImages(report, manifest) {
  report.sections.forEach(section => {
    section.images = manifest.pages[pageKey("section", section.slug)] || [];
    section.subsections.forEach(subsection => {
      subsection.images = manifest.pages[pageKey("subsection", subsection.slug)] || [];
    });
  });

  return report;
}

function attachSpreadsheets(report, manifest) {
  report.sections.forEach(section => {
    section.spreadsheets = manifest.pages[pageKey("section", section.slug)] || [];
  });

  return report;
}

function appendLooseSection(group, line, usedSectionSlugs) {
  const appendixMatch = line.match(/^(Appendix\s+[A-Z])\s+[—-]\s+(.+)$/);

  if (!appendixMatch) {
    group.bodyLines.push(line);
    return;
  }

  const title = asText(appendixMatch[2]);
  const slug = uniqueSlug(slugFromText(`${appendixMatch[1]} ${title}`), usedSectionSlugs);

  group.sections.push({
    number: appendixMatch[1],
    title,
    slug,
    bodyLines: [],
    subsections: [],
    groupTitle: group.title,
    groupSlug: group.slug
  });
}

export function assertEngineeringReportSlug(slug) {
  return assertProjectSlug(slug);
}

export function assertEngineeringReportPageKind(kind) {
  const normalized = asText(kind);

  if (!PAGE_KINDS.has(normalized)) {
    throw reportError("Engineering report page type must be section or subsection.");
  }

  return normalized;
}

export function parseEngineeringReportOutline(markdown, options = {}) {
  const reportSlug = assertEngineeringReportSlug(options.slug || DEFAULT_REPORT_SLUG);
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const groups = [];
  const usedGroupSlugs = new Set();
  const usedSectionSlugs = new Set();
  const usedSubsectionSlugs = new Set();
  let title = "Engineering report";
  let introLines = [];
  let currentGroup = {
    title: "Project and design basis",
    slug: uniqueSlug("project-and-design-basis", usedGroupSlugs),
    bodyLines: [],
    sections: []
  };
  let currentSection = null;
  let sawTitle = false;

  groups.push(currentGroup);

  lines.forEach(line => {
    if (line.startsWith("# ")) {
      const heading = stripHeading(line);

      if (!sawTitle) {
        title = heading;
        sawTitle = true;
        return;
      }

      currentGroup = {
        title: heading,
        slug: uniqueSlug(slugFromText(heading), usedGroupSlugs),
        bodyLines: [],
        sections: []
      };
      groups.push(currentGroup);
      currentSection = null;
      return;
    }

    if (line.startsWith("## ")) {
      const heading = stripHeading(line);
      const numberMatch = heading.match(/^(\d+)\.\s+(.+)$/);
      const number = numberMatch ? numberMatch[1] : "";
      const sectionTitle = numberMatch ? numberMatch[2] : heading;
      const slug = uniqueSlug(slugFromText(`${number || "section"} ${sectionTitle}`), usedSectionSlugs);

      currentSection = {
        number,
        title: sectionTitle,
        slug,
        bodyLines: [],
        subsections: [],
        groupTitle: currentGroup.title,
        groupSlug: currentGroup.slug
      };
      currentGroup.sections.push(currentSection);
      return;
    }

    if (!currentSection) {
      if (sawTitle && groups.length === 1 && !currentGroup.sections.length) {
        introLines.push(line);
      } else {
        appendLooseSection(currentGroup, line, usedSectionSlugs);
      }
      return;
    }

    const subsectionMatch = line.match(/^(\d+\.\d+)\s+(.+?)\s*$/);

    if (subsectionMatch) {
      const number = subsectionMatch[1];
      const subsectionTitle = subsectionMatch[2];
      currentSection.subsections.push({
        number,
        title: subsectionTitle,
        slug: uniqueSlug(slugFromText(`${number} ${subsectionTitle}`), usedSubsectionSlugs),
        sectionSlug: currentSection.slug,
        sectionNumber: currentSection.number,
        sectionTitle: currentSection.title,
        groupTitle: currentSection.groupTitle,
        groupSlug: currentSection.groupSlug
      });
      return;
    }

    currentSection.bodyLines.push(line);
  });

  const sections = groups.flatMap(group => group.sections);
  const subsections = sections.flatMap(section => section.subsections);

  return {
    slug: reportSlug,
    title,
    introLines: meaningfulLines(introLines),
    groups: groups
      .map(group => ({
        ...group,
        bodyLines: meaningfulLines(group.bodyLines)
      }))
      .filter(group => group.sections.length || group.bodyLines.length),
    sections,
    subsections,
    sectionCount: sections.length,
    subsectionCount: subsections.length
  };
}

export async function readEngineeringReport(slug = DEFAULT_REPORT_SLUG) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const filePath = reportPath(safeSlug);
  const [markdown, stats] = await Promise.all([
    fs.readFile(filePath, "utf8"),
    fs.stat(filePath)
  ]);
  const [imageManifest, spreadsheetManifest, subsectionManifest, orderManifest] = await Promise.all([
    readImageManifest(safeSlug),
    readSpreadsheetManifest(safeSlug),
    readSubsectionManifest(safeSlug),
    readOrderManifest(safeSlug)
  ]);
  const report = parseEngineeringReportOutline(markdown, { slug: safeSlug });

  attachImages(report, imageManifest);
  attachSpreadsheets(report, spreadsheetManifest);
  attachSubsectionDrafts(report, subsectionManifest);
  applyOrder(report, orderManifest);

  report.updatedAt = stats.mtime.toISOString();

  return report;
}

export async function readDefaultEngineeringReport() {
  return readEngineeringReport(DEFAULT_REPORT_SLUG);
}

export function findEngineeringReportSection(report, sectionSlug) {
  const safeSlug = assertEngineeringReportSlug(sectionSlug);
  const section = report.sections.find(item => item.slug === safeSlug);

  if (!section) {
    throw reportError("Engineering report section was not found.", 404);
  }

  return section;
}

export function findEngineeringReportSubsection(report, subsectionSlug) {
  const safeSlug = assertEngineeringReportSlug(subsectionSlug);
  const subsection = report.subsections.find(item => item.slug === safeSlug);

  if (!subsection) {
    throw reportError("Engineering report subsection was not found.", 404);
  }

  return subsection;
}

export async function addEngineeringReportImage(slug, pageKind, pageSlug, image) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const key = pageKey(pageKind, pageSlug);
  const manifest = await readImageManifest(safeSlug);
  const images = manifest.pages[key] || [];

  manifest.pages[key] = [
    ...images,
    normalizeImage(image)
  ];

  const savedManifest = await writeImageManifest(safeSlug, manifest);

  return savedManifest.pages[key];
}

export async function addEngineeringReportSpreadsheet(slug, sectionSlug, spreadsheet) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const key = pageKey("section", sectionSlug);
  const manifest = await readSpreadsheetManifest(safeSlug);
  const spreadsheets = manifest.pages[key] || [];

  manifest.pages[key] = [
    ...spreadsheets,
    normalizeSpreadsheet(spreadsheet)
  ];

  const savedManifest = await writeSpreadsheetManifest(safeSlug, manifest);

  return savedManifest.pages[key];
}

export async function saveEngineeringReportSectionDraft(slug, sectionSlug, draft) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const safeSectionSlug = assertEngineeringReportSlug(sectionSlug);
  const report = await readEngineeringReport(safeSlug);

  findEngineeringReportSection(report, safeSectionSlug);

  const manifest = await readSubsectionManifest(safeSlug);
  const normalized = normalizeSectionDraft({
    ...draft,
    updatedAt: new Date().toISOString()
  });

  manifest.sections[safeSectionSlug] = normalized;

  const savedManifest = await writeSubsectionManifest(safeSlug, manifest);

  return savedManifest.sections[safeSectionSlug] || blankSectionDraft();
}

export async function saveEngineeringReportSubsectionDraft(slug, subsectionSlug, draft) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const safeSubsectionSlug = assertEngineeringReportSlug(subsectionSlug);
  const report = await readEngineeringReport(safeSlug);

  findEngineeringReportSubsection(report, safeSubsectionSlug);

  const manifest = await readSubsectionManifest(safeSlug);
  const normalized = normalizeSubsectionDraft({
    ...draft,
    updatedAt: new Date().toISOString()
  });

  manifest.subsections[safeSubsectionSlug] = normalized;

  const savedManifest = await writeSubsectionManifest(safeSlug, manifest);

  return savedManifest.subsections[safeSubsectionSlug] || blankSubsectionDraft();
}

function completeOrderedSlugList(submittedSlugs, allowedSlugs) {
  const allowed = new Set(allowedSlugs);
  const ordered = [];
  const used = new Set();

  normalizeSlugList(submittedSlugs).forEach(slug => {
    if (allowed.has(slug) && !used.has(slug)) {
      ordered.push(slug);
      used.add(slug);
    }
  });

  allowedSlugs.forEach(slug => {
    if (!used.has(slug)) {
      ordered.push(slug);
    }
  });

  return ordered;
}

export async function saveEngineeringReportOrder(slug, order = {}) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const report = await readEngineeringReport(safeSlug);
  const groupSlugs = completeOrderedSlugList(order.groupSlugs, report.groups.map(group => group.slug));
  const subsectionsBySectionSlug = {};

  report.sections.forEach(section => {
    subsectionsBySectionSlug[section.slug] = completeOrderedSlugList(
      order.subsectionsBySectionSlug?.[section.slug],
      section.subsections.map(subsection => subsection.slug)
    );
  });

  await writeOrderManifest(safeSlug, {
    groupSlugs,
    subsectionsBySectionSlug
  });

  return readEngineeringReport(safeSlug);
}
