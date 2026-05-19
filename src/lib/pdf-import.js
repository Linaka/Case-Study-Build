import path from "node:path";
import { createRequire } from "node:module";

import { BD_FIELD_LIMITS, PROJECT_FIELD_LIMITS } from "./limits.js";

const require = createRequire(import.meta.url);
const parsePdf = require("pdf-parse/lib/pdf-parse.js");

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

const PDF_CONTENT_TYPES = new Set(["application/pdf", "application/x-pdf", "application/octet-stream"]);
const STATUS_WORDS = new Set(["public", "private", "hidden"]);
const STATUS_FRAGMENTS = new Set(["pu", "blic", "pri", "priv", "vat", "ate", "e"]);

function pdfImportError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asText(value) {
  return String(value ?? "").trim();
}

function compact(value) {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clip(value, maxLength) {
  const text = asText(value).replace(/\s+/g, " ");

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).replace(/\s+\S*$/, "").trim() || text.slice(0, maxLength).trim();
}

function joinLines(lines) {
  return lines.map(asText).filter(Boolean).join(" ").replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();
}

function cleanText(text) {
  return asText(text)
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLines(text) {
  return cleanText(text).split(/\n+/).map(line => line.trim()).filter(Boolean);
}

function isStatusLine(line) {
  return STATUS_WORDS.has(compact(line));
}

function isNoiseLine(line) {
  const normalized = compact(line);

  return !normalized || STATUS_WORDS.has(normalized) || STATUS_FRAGMENTS.has(normalized) || normalized === "sourcejsonhtmlpreviewmarkdownexporta4pdf";
}

function lineEquals(line, label) {
  return asText(line).toLowerCase() === asText(label).toLowerCase();
}

function headingMatches(line, label) {
  const rawLine = asText(line).toLowerCase();
  const normalizedLine = rawLine.replace(/\d+$/, "").trim();
  const normalizedLabel = asText(label).toLowerCase();

  return rawLine === normalizedLabel || normalizedLine === normalizedLabel || (normalizedLabel && rawLine.startsWith(normalizedLabel) && /\d$/.test(rawLine));
}

function findHeading(lines, label, start = 0) {
  return lines.findIndex((line, index) => index >= start && headingMatches(line, label));
}

function findAnyHeading(lines, labels, start = 0) {
  const matches = labels
    .map(label => findHeading(lines, label, start))
    .filter(index => index >= 0);

  return matches.length ? Math.min(...matches) : -1;
}

function sectionLines(lines, label, nextLabels = [], start = 0) {
  const headingIndex = findHeading(lines, label, start);

  if (headingIndex < 0) {
    return [];
  }

  let bodyStart = headingIndex + 1;

  while (bodyStart < lines.length && headingMatches(lines[bodyStart], label)) {
    bodyStart += 1;
  }

  const nextIndex = findAnyHeading(lines, nextLabels, bodyStart);
  return lines.slice(bodyStart, nextIndex >= 0 ? nextIndex : undefined);
}

function blockAfterLabel(lines, label, nextLabels = []) {
  const start = lines.findIndex(line => lineEquals(line, label));

  if (start < 0) {
    return [];
  }

  const nextIndex = lines.findIndex((line, index) => index > start && nextLabels.some(nextLabel => lineEquals(line, nextLabel)));
  return lines.slice(start + 1, nextIndex >= 0 ? nextIndex : undefined).filter(line => !isNoiseLine(line));
}

function splitAtLabel(lines, label) {
  const index = lines.findIndex(line => lineEquals(line, label));

  if (index < 0) {
    return {
      before: lines,
      after: []
    };
  }

  return {
    before: lines.slice(0, index),
    after: lines.slice(index + 1)
  };
}

function collectSentence(lines, maxLines = 5) {
  const collected = [];

  for (const line of lines.filter(line => !isNoiseLine(line))) {
    collected.push(line);

    if (/[.!?]$/.test(line) || collected.length >= maxLines) {
      break;
    }
  }

  return joinLines(collected);
}

function collectSentenceParts(lines, maxLines = 5) {
  const cleaned = lines.filter(line => !isNoiseLine(line));
  const collected = [];

  for (const line of cleaned) {
    collected.push(line);

    if (/[.!?]$/.test(line) || collected.length >= maxLines) {
      break;
    }
  }

  return {
    text: joinLines(collected),
    rest: cleaned.slice(collected.length)
  };
}

function paragraphFromLines(lines, maxLength) {
  return clip(joinLines(lines.filter(line => !isNoiseLine(line))), maxLength);
}

function splitCommaList(lines) {
  return joinLines(lines)
    .split(",")
    .map(item => clip(item, 90))
    .filter(Boolean);
}

function firstYear(lines) {
  const match = joinLines(lines).match(/(?:^|[^0-9])((?:19|20)\d{2}(?:[-/](?:\d{2}|\d{4}))?)(?!\d)/);
  return match ? match[1] : "";
}

function titleFromFileName(fileName, fallback = "Imported PDF") {
  const baseName = path.parse(String(fileName || "")).name;
  const title = baseName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  return title || fallback;
}

function usablePdfTitle(title) {
  const text = asText(title);

  if (!text || /^about:blank$/i.test(text)) {
    return "";
  }

  return text;
}

function coverLinesBefore(lines, firstSectionLabel) {
  const sectionIndex = findHeading(lines, firstSectionLabel);
  return lines.slice(0, sectionIndex >= 0 ? sectionIndex : Math.min(lines.length, 16));
}

function findJoinedSequenceEnd(lines, text) {
  const target = compact(text);

  if (!target) {
    return -1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    let joined = "";

    for (let end = index; end < Math.min(lines.length, index + 6); end += 1) {
      joined += compact(lines[end]);

      if (joined === target) {
        return end + 1;
      }
    }
  }

  return -1;
}

function subtitleFromCover(lines, title, maxLength, knownValues = []) {
  const known = knownValues.map(compact).filter(value => value.length > 6);
  const filtered = lines.filter(line => {
    const normalized = compact(line);

    if (isNoiseLine(line) || /^casestudy\d{4}/.test(normalized) || /^businessdevelopment\d{4}/.test(normalized)) {
      return false;
    }

    if (known.some(value => normalized.includes(value) || value.includes(normalized))) {
      return false;
    }

    return true;
  });
  const titleEnd = findJoinedSequenceEnd(filtered, title);
  const afterTitle = titleEnd >= 0 ? filtered.slice(titleEnd) : filtered.slice(1);

  return clip(collectSentence(afterTitle, 4), maxLength);
}

function parseProjectSnapshot(lines) {
  const collaboratorsAndContext = blockAfterLabel(lines, "Collaborators", []);
  const contextStart = collaboratorsAndContext.findIndex((line, index) => {
    if (index === 0) {
      return false;
    }

    return !line.includes(",") && line.split(/\s+/).length >= 5;
  });
  const collaboratorLines = contextStart >= 0 ? collaboratorsAndContext.slice(0, contextStart) : collaboratorsAndContext;
  const contextLines = contextStart >= 0 ? collaboratorsAndContext.slice(contextStart) : [];

  return {
    year: joinLines(blockAfterLabel(lines, "Year", ["Sector"])),
    sector: joinLines(blockAfterLabel(lines, "Sector", ["Client type"])),
    clientType: joinLines(blockAfterLabel(lines, "Client type", ["Role"])),
    role: joinLines(blockAfterLabel(lines, "Role", ["Collaborators"])),
    collaborators: splitCommaList(collaboratorLines),
    context: joinLines(contextLines)
  };
}

function inferTitleLineCount(lines) {
  const firstLongBodyLine = lines.findIndex((line, index) => index > 0 && line.length >= 34);

  if (firstLongBodyLine > 0) {
    return Math.min(firstLongBodyLine, 3);
  }

  if (lines.length >= 7) {
    return 3;
  }

  if (lines.length >= 4) {
    return 2;
  }

  return 1;
}

function splitNumberedItem(lines, titleMax, descriptionMax, forcedTitleLineCount) {
  const usefulLines = lines.filter(line => !isNoiseLine(line));

  if (!usefulLines.length) {
    return null;
  }

  const titleLineCount = forcedTitleLineCount || inferTitleLineCount(usefulLines);
  const title = clip(joinLines(usefulLines.slice(0, titleLineCount)), titleMax);
  const description = clip(joinLines(usefulLines.slice(titleLineCount)), descriptionMax);

  return title || description ? { title, description } : null;
}

function parseNumberedItems(lines, titleMax, descriptionMax, key = "title", options = {}) {
  const items = [];
  let current = null;

  for (const line of lines) {
    if (/^\d{1,2}$/.test(line)) {
      if (current) {
        items.push(current);
      }

      current = [];
      continue;
    }

    if (!current || headingMatches(line, "Key visual decisions") || headingMatches(line, "Outputs") || headingMatches(line, "Impact")) {
      continue;
    }

    current.push(line);
  }

  if (current) {
    items.push(current);
  }

  return items
    .map(itemLines => splitNumberedItem(itemLines, titleMax, descriptionMax, options.titleLineCount))
    .filter(Boolean)
    .map(item => key === "metric" ? { metric: item.title, description: item.description } : item);
}

function parseProjectDraft(text, options = {}) {
  const lines = cleanLines(text);
  const snapshot = parseProjectSnapshot(sectionLines(lines, "Project snapshot", ["Challenge", "Communication challenge"]));
  const title = clip(usablePdfTitle(options.pdfTitle) || titleFromFileName(options.fileName, "Imported case study"), PROJECT_FIELD_LIMITS.title);
  const year = clip(snapshot.year || firstYear(lines.slice(0, 20)), PROJECT_FIELD_LIMITS.year);
  const cover = coverLinesBefore(lines, "Project snapshot");
  const subtitle = subtitleFromCover(cover, title, PROJECT_FIELD_LIMITS.subtitle, [
    year,
    snapshot.sector,
    snapshot.clientType,
    snapshot.role,
    ...snapshot.collaborators
  ]);
  const challengeParts = splitAtLabel(sectionLines(lines, "Communication challenge", ["Approach"]), "Audience");
  const reflectionParts = splitAtLabel(sectionLines(lines, "Reflection", []), "Confidentiality notes");
  const approachLines = sectionLines(lines, "Approach", ["Key visual decisions", "Decisions"]);
  const keyDecisionLines = sectionLines(lines, "Key visual decisions", ["Outputs"]);
  const outputLines = sectionLines(lines, "Outputs", ["Impact"]);
  const impactLines = sectionLines(lines, "Impact", ["Reflection"]);
  const fallbackContext = !snapshot.context && !challengeParts.before.length && !approachLines.length
    ? paragraphFromLines(lines.filter(line => compact(line) !== compact(title)), PROJECT_FIELD_LIMITS.context)
    : "";

  return {
    title,
    subtitle,
    year,
    sector: clip(snapshot.sector, PROJECT_FIELD_LIMITS.sector),
    clientType: clip(snapshot.clientType, PROJECT_FIELD_LIMITS.clientType),
    role: clip(snapshot.role, PROJECT_FIELD_LIMITS.role),
    collaborators: snapshot.collaborators.slice(0, 20),
    context: clip(snapshot.context || fallbackContext, PROJECT_FIELD_LIMITS.context),
    challenge: paragraphFromLines(challengeParts.before, PROJECT_FIELD_LIMITS.challenge),
    audience: paragraphFromLines(challengeParts.after, PROJECT_FIELD_LIMITS.audience),
    approach: paragraphFromLines(approachLines.filter(line => !/^source json/i.test(line)), PROJECT_FIELD_LIMITS.approach),
    keyDecisions: parseNumberedItems(keyDecisionLines, PROJECT_FIELD_LIMITS.titleListTitle, PROJECT_FIELD_LIMITS.titleListDescription),
    outputs: parseNumberedItems(outputLines, PROJECT_FIELD_LIMITS.titleListTitle, PROJECT_FIELD_LIMITS.titleListDescription),
    impact: parseNumberedItems(impactLines, PROJECT_FIELD_LIMITS.impactMetric, PROJECT_FIELD_LIMITS.titleListDescription, "metric"),
    reflection: paragraphFromLines(reflectionParts.before, PROJECT_FIELD_LIMITS.reflection),
    confidentialityNotes: paragraphFromLines(reflectionParts.after, PROJECT_FIELD_LIMITS.confidentialityNotes)
  };
}

function splitPromise(lines) {
  const audienceParts = splitAtLabel(lines, "Audience");
  const promise = collectSentenceParts(audienceParts.before, 5);

  return {
    executivePromise: promise.text,
    positioning: joinLines(promise.rest),
    audience: joinLines(audienceParts.after)
  };
}

function parseOfferItems(lines) {
  return parseNumberedItems(lines, BD_FIELD_LIMITS.offerTitle, BD_FIELD_LIMITS.offerDescription, "title", { titleLineCount: 1 })
    .map(item => ({
      title: item.title,
      description: item.description,
      deliverables: []
    }));
}

function parseEngagementItems(lines) {
  const items = [];
  let current = null;

  for (const line of lines) {
    if (/^\d{1,2}$/.test(line)) {
      if (current) {
        items.push(current);
      }

      current = [];
      continue;
    }

    if (!current || headingMatches(line, "Engagement models")) {
      continue;
    }

    current.push(line);
  }

  if (current) {
    items.push(current);
  }

  return items.map(itemLines => {
    const bestFor = splitAtLabel(itemLines, "Best for");
    const scope = splitAtLabel(bestFor.after, "Scope");
    const timeline = splitAtLabel(scope.after, "Timeline");
    const title = joinLines(bestFor.before);

    return {
      title: clip(title, BD_FIELD_LIMITS.engagementTitle),
      bestFor: paragraphFromLines(scope.before, BD_FIELD_LIMITS.engagementBestFor),
      scope: paragraphFromLines(timeline.before, BD_FIELD_LIMITS.engagementScope),
      timeline: clip(joinLines(timeline.after), BD_FIELD_LIMITS.engagementTimeline)
    };
  }).filter(item => item.title || item.bestFor || item.scope || item.timeline);
}

function stripVisibilitySuffix(line) {
  const match = asText(line).match(/(public|private|hidden)$/i);

  if (!match) {
    return {
      text: asText(line),
      visibility: ""
    };
  }

  return {
    text: asText(line).slice(0, -match[1].length).trim(),
    visibility: match[1].toLowerCase()
  };
}

function splitProofItems(lines) {
  const items = [];
  let current = [];

  for (const line of lines) {
    if (headingMatches(line, "Proof")) {
      if (current.length) {
        items.push(current);
      }

      current = [];
      continue;
    }

    current.push(line);
  }

  if (current.length) {
    items.push(current);
  }

  return items;
}

function parseProofHeader(lines) {
  const headerLines = lines.filter(line => !isNoiseLine(line));
  let visibility = "private";
  let projectSlug = "";
  let clientContext = "";

  if (headerLines.length) {
    const stripped = stripVisibilitySuffix(headerLines[headerLines.length - 1]);

    if (stripped.visibility) {
      visibility = stripped.visibility;
      headerLines[headerLines.length - 1] = stripped.text;
    }
  }

  const sourceIndex = headerLines.findIndex(line => /^source:/i.test(line));

  if (sourceIndex >= 0) {
    projectSlug = clip(headerLines[sourceIndex].replace(/^source:\s*/i, ""), BD_FIELD_LIMITS.proofProjectSlug);
    headerLines.splice(sourceIndex, 1);
  }

  if (headerLines.length > 1) {
    clientContext = clip(headerLines.pop(), BD_FIELD_LIMITS.proofClientContext);
  }

  return {
    headline: clip(joinLines(headerLines), BD_FIELD_LIMITS.proofHeadline),
    clientContext,
    projectSlug,
    visibility
  };
}

function parseProofItems(lines) {
  return splitProofItems(lines).map(itemLines => {
    const problem = splitAtLabel(itemLines, "Problem");
    const intervention = splitAtLabel(problem.after, "Intervention");
    const outcome = splitAtLabel(intervention.after, "Outcome");
    const evidence = splitAtLabel(outcome.after, "Evidence");
    const header = parseProofHeader(problem.before);

    return {
      ...header,
      problem: paragraphFromLines(intervention.before, BD_FIELD_LIMITS.proofProblem),
      intervention: paragraphFromLines(outcome.before, BD_FIELD_LIMITS.proofIntervention),
      outcome: paragraphFromLines(evidence.before, BD_FIELD_LIMITS.proofOutcome),
      evidence: clip(collectSentence(evidence.after, 5), BD_FIELD_LIMITS.proofEvidence),
      assetPath: ""
    };
  }).filter(item => item.headline || item.problem || item.intervention || item.outcome || item.evidence);
}

function parseBdDraft(text, options = {}) {
  const lines = cleanLines(text);
  const promise = splitPromise(sectionLines(lines, "Executive promise", ["Where we help", "Buyer problems"]));
  const title = clip(usablePdfTitle(options.pdfTitle) || titleFromFileName(options.fileName, "Imported business development document"), BD_FIELD_LIMITS.title);
  const year = clip(firstYear(lines.slice(0, 20)), BD_FIELD_LIMITS.year);
  const cover = coverLinesBefore(lines, "Executive promise");
  const subtitle = subtitleFromCover(cover, title, BD_FIELD_LIMITS.subtitle, [year, promise.audience]);
  const processLines = sectionLines(lines, "Delivery process", ["Proof", "Proof 1", "Engagement", "Engagement models"]);
  const firstProcessStepIndex = processLines.findIndex(line => /^\d{1,2}$/.test(line));
  const processSummaryLines = firstProcessStepIndex >= 0 ? processLines.slice(0, firstProcessStepIndex) : processLines;
  const processParts = parseNumberedItems(processLines, BD_FIELD_LIMITS.titleListTitle, BD_FIELD_LIMITS.titleListDescription);
  const nextStepParts = splitAtLabel(sectionLines(lines, "Outcomes and CTA", []), "Confidentiality");

  return {
    title,
    subtitle,
    year,
    audience: clip(promise.audience, BD_FIELD_LIMITS.audience),
    executivePromise: clip(promise.executivePromise, BD_FIELD_LIMITS.executivePromise),
    positioning: clip(promise.positioning, BD_FIELD_LIMITS.positioning),
    buyerProblems: parseNumberedItems(sectionLines(lines, "Where we help", ["Offer", "Strategy through build"]), BD_FIELD_LIMITS.titleListTitle, BD_FIELD_LIMITS.titleListDescription, "title", { titleLineCount: 2 }),
    offerPillars: parseOfferItems(sectionLines(lines, "Strategy through build", ["Process", "Delivery process"])),
    processSummary: paragraphFromLines(processSummaryLines, BD_FIELD_LIMITS.processSummary),
    process: processParts,
    proofSections: parseProofItems(sectionLines(lines, "Proof", ["Engagement", "Engagement models"])),
    engagementModels: parseEngagementItems(sectionLines(lines, "Engagement models", ["Next steps", "Outcomes and CTA"])),
    nextSteps: paragraphFromLines(nextStepParts.before, BD_FIELD_LIMITS.nextSteps),
    primaryCta: "",
    secondaryCta: "",
    confidentialityNotes: paragraphFromLines(nextStepParts.after, BD_FIELD_LIMITS.confidentialityNotes)
  };
}

export function projectDraftFromPdfText(text, options = {}) {
  return parseProjectDraft(text, options);
}

export function bdDocumentDraftFromPdfText(text, options = {}) {
  return parseBdDraft(text, options);
}

export function assertPdfUpload(file, contentType) {
  const normalizedType = String(contentType || "").split(";")[0].trim().toLowerCase();

  if (normalizedType && !PDF_CONTENT_TYPES.has(normalizedType)) {
    throw pdfImportError("Unsupported file type. Use a PDF file.", 415);
  }

  if (!file.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw pdfImportError("PDF import does not look like a valid PDF file.", 415);
  }
}

export async function extractPdfText(file) {
  const parsed = await parsePdf(file);
  const text = cleanText(parsed.text || "");

  if (!text) {
    throw pdfImportError("PDF text could not be read. Use a text-based PDF rather than a scanned image.", 422);
  }

  return {
    text,
    pageCount: Number(parsed.numpages || 0),
    title: usablePdfTitle(parsed.info?.Title)
  };
}

export async function importProjectPdf(file, options = {}) {
  const extracted = await extractPdfText(file);

  return {
    project: parseProjectDraft(extracted.text, { ...options, pdfTitle: extracted.title }),
    pageCount: extracted.pageCount,
    textLength: extracted.text.length
  };
}

export async function importBdDocumentPdf(file, options = {}) {
  const extracted = await extractPdfText(file);

  return {
    document: parseBdDraft(extracted.text, { ...options, pdfTitle: extracted.title }),
    pageCount: extracted.pageCount,
    textLength: extracted.text.length
  };
}
