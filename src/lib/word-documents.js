import zlib from "node:zlib";

import { BD_FIELD_LIMITS, PROJECT_FIELD_LIMITS, TEXT_LIMITS } from "./limits.js";
import { normalizeBdDocument } from "./bd-documents.js";
import { normalizeProject } from "./projects.js";

export const WORD_DOCUMENT_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_WORD_DOCUMENT_BYTES = 10 * 1024 * 1024;

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const MAX_DOCUMENT_XML_BYTES = 8 * 1024 * 1024;

const PROJECT_SECTIONS = new Map([
  ["metadata", "metadata"],
  ["project snapshot", "metadata"],
  ["snapshot", "metadata"],
  ["context", "context"],
  ["challenge", "challenge"],
  ["communication challenge", "challenge"],
  ["audience", "audience"],
  ["approach", "approach"],
  ["key decisions", "keyDecisions"],
  ["key visual decisions", "keyDecisions"],
  ["decisions", "keyDecisions"],
  ["outputs", "outputs"],
  ["impact", "impact"],
  ["reflection", "reflection"],
  ["confidentiality", "confidentialityNotes"],
  ["confidentiality notes", "confidentialityNotes"],
  ["assets", "assets"],
  ["visual assets", "assets"]
]);

const BD_SECTIONS = new Map([
  ["metadata", "metadata"],
  ["audience", "metadata"],
  ["executive promise", "executivePromise"],
  ["promise", "executivePromise"],
  ["positioning", "positioning"],
  ["buyer problems", "buyerProblems"],
  ["where we help", "buyerProblems"],
  ["offer pillars", "offerPillars"],
  ["offer", "offerPillars"],
  ["strategy through build", "offerPillars"],
  ["process summary", "processSummary"],
  ["delivery process summary", "processSummary"],
  ["process", "process"],
  ["delivery process", "process"],
  ["proof sections", "proofSections"],
  ["proof", "proofSections"],
  ["engagement models", "engagementModels"],
  ["engagement", "engagementModels"],
  ["next steps", "nextSteps"],
  ["outcomes and cta", "nextSteps"],
  ["calls to action", "callsToAction"],
  ["call to action", "callsToAction"],
  ["confidentiality", "confidentialityNotes"],
  ["confidentiality notes", "confidentialityNotes"],
  ["assets", "assets"],
  ["visual assets", "assets"]
]);

function wordError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function compactText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function fitText(value, maxLength) {
  const trimmed = compactText(value);

  if (!maxLength || trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength).trim();
}

function textLength(value) {
  return compactText(value).length;
}

function limitState(value, maxLength) {
  const count = textLength(value);

  if (!maxLength) {
    return null;
  }

  if (count > maxLength) {
    return {
      count,
      condition: `Too long by ${count - maxLength}`,
      style: "LimitOver"
    };
  }

  if (count >= Math.ceil(maxLength * 0.9)) {
    return {
      count,
      condition: "Near limit",
      style: "LimitNear"
    };
  }

  return {
    count,
    condition: "OK",
    style: "LimitOk"
  };
}

function splitBlocks(value) {
  return compactText(value).split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
}

function normalizeKey(value) {
  return text(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function visibility(value, fallback = "public") {
  const normalized = normalizeKey(value);
  return ["public", "private", "hidden"].includes(normalized) ? normalized : fallback;
}

function safeLocalAssetPath(value) {
  const assetPath = fitText(value, TEXT_LIMITS.path);

  if (!assetPath.startsWith("/assets/") || assetPath.includes("..") || assetPath.includes("\\")) {
    return "";
  }

  return assetPath;
}

function safeSlug(value) {
  const slug = fitText(value, BD_FIELD_LIMITS.proofProjectSlug);
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : "";
}

function splitItems(value) {
  return compactText(value).split(/[\n;,]+/).map(item => item.trim()).filter(Boolean);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlDecode(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function crc32(buffer) {
  const table = crc32.table || (crc32.table = makeCrcTable());
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function dosTime(date = new Date()) {
  return ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date = new Date()) {
  return (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const checksum = crc32(data);
    const local = Buffer.alloc(30);

    local.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    local.writeUInt16LE(ZIP_STORE_METHOD, 8);
    local.writeUInt16LE(dosTime(now), 10);
    local.writeUInt16LE(dosDate(now), 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    central.writeUInt16LE(ZIP_STORE_METHOD, 10);
    central.writeUInt16LE(dosTime(now), 12);
    central.writeUInt16LE(dosDate(now), 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_EOCD_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(offset + 20);

      if (offset + 22 + commentLength === buffer.length) {
        return offset;
      }
    }
  }

  throw wordError("The uploaded file is not a valid .docx document.");
}

function readZipEntry(buffer, expectedName) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) {
      throw wordError("The uploaded .docx package is damaged.");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString(flags & ZIP_UTF8_FLAG ? "utf8" : "latin1");

    if (name === expectedName) {
      if (uncompressedSize > MAX_DOCUMENT_XML_BYTES) {
        throw wordError("The uploaded Word document is too large to import.");
      }

      if (buffer.readUInt32LE(localOffset) !== ZIP_LOCAL_SIGNATURE) {
        throw wordError("The uploaded .docx package is damaged.");
      }

      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

      if (method === ZIP_STORE_METHOD) {
        return compressed;
      }

      if (method === ZIP_DEFLATE_METHOD) {
        return zlib.inflateRawSync(compressed, { maxOutputLength: MAX_DOCUMENT_XML_BYTES });
      }

      throw wordError("This .docx compression method is not supported.");
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw wordError("The uploaded .docx file does not include a Word document body.");
}

function paragraphXml({ text: paragraphText, style = "Normal" }) {
  const value = String(paragraphText ?? "");

  if (!value.trim()) {
    return "";
  }

  const styleXml = style && style !== "Normal" ? `<w:pPr><w:pStyle w:val="${xmlEscape(style)}"/></w:pPr>` : "";
  const runs = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line, index) => `${index ? "<w:r><w:br/></w:r>" : ""}<w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`)
    .join("");

  return `<w:p>${styleXml}${runs}</w:p>`;
}

function documentXml(paragraphs) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map(paragraphXml).join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="160"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Subtitle"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="180"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="44"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="360"/></w:pPr>
    <w:rPr><w:color w:val="555555"/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="360" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="220" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LimitOk">
    <w:name w:val="Character limit OK"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="2E7D32"/><w:sz w:val="18"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LimitNear">
    <w:name w:val="Character limit near"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="B26A00"/><w:sz w:val="18"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LimitOver">
    <w:name w:val="Character limit over"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="B00020"/><w:sz w:val="18"/></w:rPr>
  </w:style>
</w:styles>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function packageRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function documentRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
}

function corePropertiesXml(title) {
  const now = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title)}</dc:title>
  <dc:creator>Case Study Builder</dc:creator>
  <cp:lastModifiedBy>Case Study Builder</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Case Study Builder</Application>
</Properties>`;
}

function createDocx(paragraphs, title) {
  return createZip([
    { name: "[Content_Types].xml", data: contentTypesXml() },
    { name: "_rels/.rels", data: packageRelationshipsXml() },
    { name: "docProps/core.xml", data: corePropertiesXml(title) },
    { name: "docProps/app.xml", data: appPropertiesXml() },
    { name: "word/document.xml", data: documentXml(paragraphs) },
    { name: "word/styles.xml", data: stylesXml() },
    { name: "word/_rels/document.xml.rels", data: documentRelationshipsXml() }
  ]);
}

function pushLimit(paragraphs, label, value, maxLength) {
  const state = limitState(value, maxLength);

  if (!state) {
    return;
  }

  paragraphs.push({
    text: `${label} character limit: ${state.count}/${maxLength} (${state.condition})`,
    style: state.style
  });
}

function pushItemLimit(paragraphs, label, values, maxLength) {
  const items = Array.isArray(values) ? values.map(compactText).filter(Boolean) : splitItems(values);
  const longest = items.reduce((max, item) => Math.max(max, textLength(item)), 0);
  const state = limitState("x".repeat(longest), maxLength);

  if (!state) {
    return;
  }

  paragraphs.push({
    text: `${label} character limit: longest item ${longest}/${maxLength} (${state.condition})`,
    style: state.style
  });
}

function pushHeading(paragraphs, value, level = 1, maxLength, limitLabel) {
  if (text(value)) {
    paragraphs.push({ text: value, style: `Heading${level}` });
    pushLimit(paragraphs, limitLabel || "Heading", value, maxLength);
  }
}

function pushField(paragraphs, label, value, maxLength) {
  paragraphs.push({ text: `${label}: ${text(value)}`, style: "Normal" });
  pushLimit(paragraphs, label, value, maxLength);
}

function pushTextBlock(paragraphs, value, maxLength, limitLabel) {
  splitBlocks(value).forEach(block => paragraphs.push({ text: block, style: "Normal" }));
  pushLimit(paragraphs, limitLabel || "Section", value, maxLength);
}

function pushTitleDescriptionList(paragraphs, title, items, titleKey = "title", titleMax = PROJECT_FIELD_LIMITS.titleListTitle, descriptionMax = PROJECT_FIELD_LIMITS.titleListDescription) {
  pushHeading(paragraphs, title);

  items.forEach((item, index) => {
    const itemTitle = item?.[titleKey] || item?.title || item?.metric || `${title} ${index + 1}`;

    pushHeading(paragraphs, itemTitle, 2, titleMax, `${title} ${index + 1} title`);
    pushTextBlock(paragraphs, item?.description, descriptionMax, `${title} ${index + 1} description`);
  });
}

function pushImpactList(paragraphs, items) {
  pushHeading(paragraphs, "Impact");

  items.forEach((item, index) => {
    pushHeading(paragraphs, item?.metric || `Impact ${index + 1}`, 2, PROJECT_FIELD_LIMITS.impactMetric, `Impact ${index + 1} metric`);
    pushField(paragraphs, "Value", item?.value ?? "");
    pushField(paragraphs, "Unit", item?.unit, PROJECT_FIELD_LIMITS.impactUnit);
    pushTextBlock(paragraphs, item?.description, PROJECT_FIELD_LIMITS.titleListDescription, `Impact ${index + 1} description`);
  });
}

function pushAssets(paragraphs, assets, allowedSlots) {
  pushHeading(paragraphs, "Assets");

  assets.forEach((asset, index) => {
    const slot = allowedSlots.has(asset?.slot) ? asset.slot : "";
    pushHeading(paragraphs, asset?.caption || slot || `Asset ${index + 1}`, 2, TEXT_LIMITS.short, `Asset ${index + 1} heading`);
    pushField(paragraphs, "Slot", slot);
    pushField(paragraphs, "Path", asset?.path, TEXT_LIMITS.path);
    pushField(paragraphs, "Caption", asset?.caption, PROJECT_FIELD_LIMITS.assetCaption);
    pushField(paragraphs, "Visibility", asset?.visibility || "public");
  });
}

export function renderProjectDocx(project) {
  const paragraphs = [
    { text: project.title || "Untitled case study", style: "Title" }
  ];

  pushLimit(paragraphs, "Title", project.title, PROJECT_FIELD_LIMITS.title);

  if (text(project.subtitle)) {
    paragraphs.push({ text: project.subtitle, style: "Subtitle" });
  }
  pushLimit(paragraphs, "Subtitle", project.subtitle, PROJECT_FIELD_LIMITS.subtitle);

  pushHeading(paragraphs, "Metadata");
  pushField(paragraphs, "Year", project.year, PROJECT_FIELD_LIMITS.year);
  pushField(paragraphs, "Sector", project.sector, PROJECT_FIELD_LIMITS.sector);
  pushField(paragraphs, "Client type", project.clientType, PROJECT_FIELD_LIMITS.clientType);
  pushField(paragraphs, "Role", project.role, PROJECT_FIELD_LIMITS.role);
  pushField(paragraphs, "Collaborators", Array.isArray(project.collaborators) ? project.collaborators.join("; ") : "", PROJECT_FIELD_LIMITS.collaborators);

  pushHeading(paragraphs, "Context");
  pushTextBlock(paragraphs, project.context, PROJECT_FIELD_LIMITS.context, "Context");
  pushHeading(paragraphs, "Challenge");
  pushTextBlock(paragraphs, project.challenge, PROJECT_FIELD_LIMITS.challenge, "Challenge");
  pushHeading(paragraphs, "Audience");
  pushTextBlock(paragraphs, project.audience, PROJECT_FIELD_LIMITS.audience, "Audience");
  pushHeading(paragraphs, "Approach");
  pushTextBlock(paragraphs, project.approach, PROJECT_FIELD_LIMITS.approach, "Approach");
  pushTitleDescriptionList(paragraphs, "Key decisions", project.keyDecisions || []);
  pushTitleDescriptionList(paragraphs, "Outputs", project.outputs || []);
  pushImpactList(paragraphs, project.impact || []);
  pushHeading(paragraphs, "Reflection");
  pushTextBlock(paragraphs, project.reflection, PROJECT_FIELD_LIMITS.reflection, "Reflection");
  pushHeading(paragraphs, "Confidentiality notes");
  pushTextBlock(paragraphs, project.confidentialityNotes, PROJECT_FIELD_LIMITS.confidentialityNotes, "Confidentiality notes");
  pushAssets(paragraphs, project.assets || [], new Set(["", "cover", "decisions", "outputs"]));

  return createDocx(paragraphs, project.title || "Case study");
}

export function renderBdDocumentDocx(document) {
  const paragraphs = [
    { text: document.title || "Untitled business development document", style: "Title" }
  ];

  pushLimit(paragraphs, "Title", document.title, BD_FIELD_LIMITS.title);

  if (text(document.subtitle)) {
    paragraphs.push({ text: document.subtitle, style: "Subtitle" });
  }
  pushLimit(paragraphs, "Subtitle", document.subtitle, BD_FIELD_LIMITS.subtitle);

  pushHeading(paragraphs, "Metadata");
  pushField(paragraphs, "Year", document.year, BD_FIELD_LIMITS.year);
  pushField(paragraphs, "Audience", document.audience, BD_FIELD_LIMITS.audience);

  pushHeading(paragraphs, "Executive promise");
  pushTextBlock(paragraphs, document.executivePromise, BD_FIELD_LIMITS.executivePromise, "Executive promise");
  pushHeading(paragraphs, "Positioning");
  pushTextBlock(paragraphs, document.positioning, BD_FIELD_LIMITS.positioning, "Positioning");
  pushTitleDescriptionList(paragraphs, "Buyer problems", document.buyerProblems || [], "title", BD_FIELD_LIMITS.titleListTitle, BD_FIELD_LIMITS.titleListDescription);

  pushHeading(paragraphs, "Offer pillars");
  (document.offerPillars || []).forEach((item, index) => {
    pushHeading(paragraphs, item?.title || `Offer ${index + 1}`, 2, BD_FIELD_LIMITS.offerTitle, `Offer ${index + 1} title`);
    pushTextBlock(paragraphs, item?.description, BD_FIELD_LIMITS.offerDescription, `Offer ${index + 1} description`);
    pushField(paragraphs, "Deliverables", Array.isArray(item?.deliverables) ? item.deliverables.join("; ") : "");
    pushItemLimit(paragraphs, `Offer ${index + 1} deliverables`, item?.deliverables || [], TEXT_LIMITS.label);
  });

  pushHeading(paragraphs, "Process summary");
  pushTextBlock(paragraphs, document.processSummary, BD_FIELD_LIMITS.processSummary, "Process summary");
  pushTitleDescriptionList(paragraphs, "Process", document.process || [], "title", BD_FIELD_LIMITS.titleListTitle, BD_FIELD_LIMITS.titleListDescription);

  pushHeading(paragraphs, "Proof sections");
  (document.proofSections || []).forEach((proof, index) => {
    pushHeading(paragraphs, proof?.headline || `Proof ${index + 1}`, 2, BD_FIELD_LIMITS.proofHeadline, `Proof ${index + 1} headline`);
    pushField(paragraphs, "Client context", proof?.clientContext, BD_FIELD_LIMITS.proofClientContext);
    pushField(paragraphs, "Project slug", proof?.projectSlug, BD_FIELD_LIMITS.proofProjectSlug);
    pushField(paragraphs, "Visibility", proof?.visibility || "private");
    pushField(paragraphs, "Asset path", proof?.assetPath, BD_FIELD_LIMITS.proofAssetPath);
    pushField(paragraphs, "Problem", proof?.problem, BD_FIELD_LIMITS.proofProblem);
    pushField(paragraphs, "Intervention", proof?.intervention, BD_FIELD_LIMITS.proofIntervention);
    pushField(paragraphs, "Outcome", proof?.outcome, BD_FIELD_LIMITS.proofOutcome);
    pushField(paragraphs, "Evidence", proof?.evidence, BD_FIELD_LIMITS.proofEvidence);
  });

  pushHeading(paragraphs, "Engagement models");
  (document.engagementModels || []).forEach((model, index) => {
    pushHeading(paragraphs, model?.title || `Model ${index + 1}`, 2, BD_FIELD_LIMITS.engagementTitle, `Engagement model ${index + 1} title`);
    pushField(paragraphs, "Timeline", model?.timeline, BD_FIELD_LIMITS.engagementTimeline);
    pushField(paragraphs, "Best for", model?.bestFor, BD_FIELD_LIMITS.engagementBestFor);
    pushField(paragraphs, "Scope", model?.scope, BD_FIELD_LIMITS.engagementScope);
  });

  pushHeading(paragraphs, "Next steps");
  pushTextBlock(paragraphs, document.nextSteps, BD_FIELD_LIMITS.nextSteps, "Next steps");
  pushHeading(paragraphs, "Calls to action");
  pushField(paragraphs, "Primary CTA", document.primaryCta, BD_FIELD_LIMITS.primaryCta);
  pushField(paragraphs, "Secondary CTA", document.secondaryCta, BD_FIELD_LIMITS.secondaryCta);
  pushHeading(paragraphs, "Confidentiality notes");
  pushTextBlock(paragraphs, document.confidentialityNotes, BD_FIELD_LIMITS.confidentialityNotes, "Confidentiality notes");
  pushAssets(paragraphs, document.assets || [], new Set(["", "cover"]));

  return createDocx(paragraphs, document.title || "Business development document");
}

function styleFromParagraphXml(paragraphXmlText) {
  const match = paragraphXmlText.match(/<(?:[A-Za-z0-9_]+:)?pStyle\b[^>]*(?:[A-Za-z0-9_]+:)?val=["']([^"']+)["']/);
  return match ? xmlDecode(match[1]) : "Normal";
}

function isLimitStyle(style) {
  return /^Limit(?:Ok|Near|Over)$/i.test(String(style || ""));
}

function textFromParagraphXml(paragraphXmlText) {
  const tokens = paragraphXmlText.matchAll(/<(?:[A-Za-z0-9_]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?t>|<(?:[A-Za-z0-9_]+:)?tab\b[^>]*\/>|<(?:[A-Za-z0-9_]+:)?br\b[^>]*\/>/g);
  let value = "";

  for (const token of tokens) {
    if (token[1] !== undefined) {
      value += xmlDecode(token[1]);
    } else if (token[0].includes(":tab") || token[0].includes("<tab")) {
      value += "\t";
    } else {
      value += "\n";
    }
  }

  return compactText(value);
}

function paragraphsFromDocx(buffer) {
  const document = readZipEntry(buffer, "word/document.xml").toString("utf8");
  const paragraphMatches = document.match(/<(?:[A-Za-z0-9_]+:)?p\b[\s\S]*?<\/(?:[A-Za-z0-9_]+:)?p>/g) || [];

  return paragraphMatches
    .map(paragraph => ({
      text: textFromParagraphXml(paragraph),
      style: styleFromParagraphXml(paragraph)
    }))
    .filter(paragraph => paragraph.text && !isLimitStyle(paragraph.style));
}

function headingLevel(style) {
  const match = String(style || "").match(/Heading\s*([1-6])/i);
  return match ? Number(match[1]) : 0;
}

function isSubheading(paragraph) {
  const level = headingLevel(paragraph.style);
  return level >= 2 || paragraph.style === "Heading2" || paragraph.style === "Heading3";
}

function canonicalSection(value, aliases) {
  return aliases.get(normalizeKey(value)) || "";
}

function splitSections(paragraphs, aliases) {
  const sections = new Map([["intro", []]]);
  let current = "intro";

  for (const paragraph of paragraphs) {
    const section = canonicalSection(paragraph.text, aliases);

    if (section) {
      current = section;

      if (!sections.has(current)) {
        sections.set(current, []);
      }
      continue;
    }

    sections.get(current).push(paragraph);
  }

  return sections;
}

function extractTitleAndSubtitle(paragraphs, aliases, fallbackTitle) {
  const firstSectionIndex = paragraphs.findIndex(paragraph => canonicalSection(paragraph.text, aliases));
  const preface = paragraphs
    .slice(0, firstSectionIndex === -1 ? paragraphs.length : firstSectionIndex)
    .filter(paragraph => paragraph.text && !parseField(paragraph.text));
  const titleIndex = preface.findIndex(paragraph => normalizeKey(paragraph.style) === "title");
  const subtitleIndex = preface.findIndex(paragraph => normalizeKey(paragraph.style) === "subtitle");
  const title = preface[titleIndex]?.text || preface[0]?.text || fallbackTitle;
  const subtitle = preface[subtitleIndex]?.text || preface.find((paragraph, index) => index !== titleIndex && paragraph.text !== title)?.text || "";

  return { title, subtitle };
}

function parseField(value) {
  const match = text(value).match(/^([A-Za-z][A-Za-z0-9 /&()_-]{0,80}):\s*(.*)$/);

  if (!match) {
    return null;
  }

  return {
    label: normalizeKey(match[1]),
    value: match[2].trim()
  };
}

function fieldMap(paragraphs = []) {
  const fields = new Map();

  for (const paragraph of paragraphs) {
    const field = parseField(paragraph.text);

    if (!field) {
      continue;
    }

    fields.set(field.label, fields.has(field.label) && field.value ? `${fields.get(field.label)}\n${field.value}` : field.value);
  }

  return fields;
}

function firstField(fields, labels) {
  for (const label of labels) {
    const value = fields.get(normalizeKey(label));

    if (value) {
      return value;
    }
  }

  return "";
}

function sectionText(sections, key, maxLength) {
  return fitText((sections.get(key) || [])
    .filter(paragraph => !isSubheading(paragraph))
    .map(paragraph => paragraph.text)
    .join("\n\n"), maxLength);
}

function cleanListText(value) {
  return text(value).replace(/^\s*(?:[-*]|\u2022|\d+[.)])\s+/, "");
}

function titleDescriptionFromText(value) {
  const match = cleanListText(value).match(/^(.{1,90}?):\s+(.+)$/);

  if (!match) {
    return null;
  }

  return {
    title: match[1].trim(),
    description: match[2].trim()
  };
}

function parseTitleDescriptionList(paragraphs = [], titleKey = "title", titleMax = PROJECT_FIELD_LIMITS.titleListTitle, descriptionMax = PROJECT_FIELD_LIMITS.titleListDescription) {
  const items = [];
  let current = null;

  function pushCurrent() {
    if (current && (current[titleKey] || current.description)) {
      items.push({
        [titleKey]: fitText(current[titleKey], titleMax),
        description: fitText(current.description, descriptionMax)
      });
    }

    current = null;
  }

  for (const paragraph of paragraphs) {
    const value = cleanListText(paragraph.text);

    if (!value) {
      continue;
    }

    if (isSubheading(paragraph)) {
      pushCurrent();
      current = { [titleKey]: value, description: "" };
      continue;
    }

    const field = parseField(value);

    if (field && current) {
      if (["title", "metric"].includes(field.label)) {
        current[titleKey] = field.value;
      } else if (field.label === "description") {
        current.description = [current.description, field.value].filter(Boolean).join("\n");
      }
      continue;
    }

    const split = titleDescriptionFromText(value);

    if (!current && split) {
      items.push({
        [titleKey]: fitText(split.title, titleMax),
        description: fitText(split.description, descriptionMax)
      });
      continue;
    }

    if (!current) {
      current = { [titleKey]: value, description: "" };
      continue;
    }

    current.description = [current.description, value].filter(Boolean).join("\n");
  }

  pushCurrent();
  return items.slice(0, TEXT_LIMITS.listItems);
}

function safeImpactValue(value) {
  const rawValue = text(value).replace(/,/g, "");

  if (!rawValue) {
    return null;
  }

  return Number.isFinite(Number(rawValue)) ? rawValue : null;
}

function parseImpactList(paragraphs = []) {
  const items = [];
  let current = null;

  function pushCurrent() {
    if (current && (current.metric || current.value !== null || current.unit || current.description)) {
      items.push({
        metric: fitText(current.metric, PROJECT_FIELD_LIMITS.impactMetric),
        value: safeImpactValue(current.value),
        unit: fitText(current.unit, PROJECT_FIELD_LIMITS.impactUnit),
        description: fitText(current.description, PROJECT_FIELD_LIMITS.titleListDescription)
      });
    }

    current = null;
  }

  for (const paragraph of paragraphs) {
    const value = cleanListText(paragraph.text);

    if (!value) {
      continue;
    }

    if (isSubheading(paragraph)) {
      pushCurrent();
      current = { metric: value, value: null, unit: "", description: "" };
      continue;
    }

    current ||= { metric: "", value: null, unit: "", description: "" };
    const field = parseField(value);

    if (field?.label === "metric") {
      current.metric = field.value;
    } else if (field?.label === "value") {
      current.value = field.value;
    } else if (field?.label === "unit") {
      current.unit = field.value;
    } else if (field?.label === "description") {
      current.description = [current.description, field.value].filter(Boolean).join("\n");
    } else {
      const split = titleDescriptionFromText(value);

      if (!current.metric && split) {
        current.metric = split.title;
        current.description = [current.description, split.description].filter(Boolean).join("\n");
      } else if (!current.metric) {
        current.metric = value;
      } else {
        current.description = [current.description, value].filter(Boolean).join("\n");
      }
    }
  }

  pushCurrent();
  return items.slice(0, TEXT_LIMITS.listItems);
}

function parseOfferPillars(paragraphs = []) {
  const items = [];
  let current = null;

  function pushCurrent() {
    if (current && (current.title || current.description || current.deliverables.length)) {
      items.push({
        title: fitText(current.title, BD_FIELD_LIMITS.offerTitle),
        description: fitText(current.description, BD_FIELD_LIMITS.offerDescription),
        deliverables: current.deliverables.map(item => fitText(item, TEXT_LIMITS.label)).filter(Boolean).slice(0, TEXT_LIMITS.listItems)
      });
    }

    current = null;
  }

  for (const paragraph of paragraphs) {
    const value = cleanListText(paragraph.text);

    if (!value) {
      continue;
    }

    if (isSubheading(paragraph)) {
      pushCurrent();
      current = { title: value, description: "", deliverables: [] };
      continue;
    }

    current ||= { title: "", description: "", deliverables: [] };
    const field = parseField(value);

    if (field?.label === "deliverables") {
      current.deliverables.push(...splitItems(field.value));
    } else if (field?.label === "title") {
      current.title = field.value;
    } else if (field?.label === "description") {
      current.description = [current.description, field.value].filter(Boolean).join("\n");
    } else {
      const split = titleDescriptionFromText(value);

      if (!current.title && split) {
        current.title = split.title;
        current.description = [current.description, split.description].filter(Boolean).join("\n");
      } else if (!current.title) {
        current.title = value;
      } else {
        current.description = [current.description, value].filter(Boolean).join("\n");
      }
    }
  }

  pushCurrent();
  return items.slice(0, TEXT_LIMITS.listItems);
}

function parseProofSections(paragraphs = []) {
  const items = [];
  let current = null;
  const fieldNames = new Map([
    ["headline", "headline"],
    ["client context", "clientContext"],
    ["project slug", "projectSlug"],
    ["asset path", "assetPath"],
    ["path", "assetPath"],
    ["visibility", "visibility"],
    ["problem", "problem"],
    ["intervention", "intervention"],
    ["outcome", "outcome"],
    ["evidence", "evidence"]
  ]);

  function pushCurrent() {
    if (current && (current.headline || current.problem || current.intervention || current.outcome || current.evidence || current.assetPath)) {
      items.push({
        headline: fitText(current.headline, BD_FIELD_LIMITS.proofHeadline),
        clientContext: fitText(current.clientContext, BD_FIELD_LIMITS.proofClientContext),
        projectSlug: safeSlug(current.projectSlug),
        assetPath: safeLocalAssetPath(current.assetPath),
        visibility: visibility(current.visibility, "private"),
        problem: fitText(current.problem, BD_FIELD_LIMITS.proofProblem),
        intervention: fitText(current.intervention, BD_FIELD_LIMITS.proofIntervention),
        outcome: fitText(current.outcome, BD_FIELD_LIMITS.proofOutcome),
        evidence: fitText(current.evidence, BD_FIELD_LIMITS.proofEvidence)
      });
    }

    current = null;
  }

  for (const paragraph of paragraphs) {
    const value = cleanListText(paragraph.text);

    if (!value) {
      continue;
    }

    if (isSubheading(paragraph)) {
      pushCurrent();
      current = { headline: value, visibility: "private" };
      continue;
    }

    current ||= { headline: "", visibility: "private" };
    const field = parseField(value);
    const fieldName = field ? fieldNames.get(field.label) : "";

    if (fieldName) {
      current[fieldName] = field.value;
    } else if (!current.problem) {
      current.problem = value;
    } else {
      current.outcome = [current.outcome, value].filter(Boolean).join("\n");
    }
  }

  pushCurrent();
  return items.slice(0, TEXT_LIMITS.listItems);
}

function parseEngagementModels(paragraphs = []) {
  const items = [];
  let current = null;
  const fieldNames = new Map([
    ["title", "title"],
    ["timeline", "timeline"],
    ["best for", "bestFor"],
    ["scope", "scope"]
  ]);

  function pushCurrent() {
    if (current && (current.title || current.bestFor || current.scope || current.timeline)) {
      items.push({
        title: fitText(current.title, BD_FIELD_LIMITS.engagementTitle),
        bestFor: fitText(current.bestFor, BD_FIELD_LIMITS.engagementBestFor),
        scope: fitText(current.scope, BD_FIELD_LIMITS.engagementScope),
        timeline: fitText(current.timeline, BD_FIELD_LIMITS.engagementTimeline)
      });
    }

    current = null;
  }

  for (const paragraph of paragraphs) {
    const value = cleanListText(paragraph.text);

    if (!value) {
      continue;
    }

    if (isSubheading(paragraph)) {
      pushCurrent();
      current = { title: value };
      continue;
    }

    current ||= { title: "" };
    const field = parseField(value);
    const fieldName = field ? fieldNames.get(field.label) : "";

    if (fieldName) {
      current[fieldName] = field.value;
    } else if (!current.title) {
      current.title = value;
    } else {
      current.scope = [current.scope, value].filter(Boolean).join("\n");
    }
  }

  pushCurrent();
  return items.slice(0, TEXT_LIMITS.listItems);
}

function slotFromHeading(value, allowedSlots) {
  const key = normalizeKey(value);

  if (allowedSlots.has(key)) {
    return key;
  }

  if (allowedSlots.has("cover") && key.includes("cover")) {
    return "cover";
  }

  if (allowedSlots.has("decisions") && key.includes("decision")) {
    return "decisions";
  }

  if (allowedSlots.has("outputs") && key.includes("output")) {
    return "outputs";
  }

  return "";
}

function parseAssets(paragraphs = [], allowedSlots = new Set([""])) {
  const assets = [];
  let current = null;
  const fieldNames = new Map([
    ["slot", "slot"],
    ["path", "path"],
    ["asset path", "path"],
    ["caption", "caption"],
    ["visibility", "visibility"]
  ]);

  function pushCurrent() {
    if (!current) {
      return;
    }

    const asset = {
      path: safeLocalAssetPath(current.path),
      caption: fitText(current.caption, PROJECT_FIELD_LIMITS.assetCaption),
      visibility: visibility(current.visibility, "public"),
      slot: allowedSlots.has(current.slot) ? current.slot : ""
    };

    if (asset.path || asset.caption) {
      assets.push(asset);
    }

    current = null;
  }

  for (const paragraph of paragraphs) {
    const value = cleanListText(paragraph.text);

    if (!value) {
      continue;
    }

    if (isSubheading(paragraph)) {
      pushCurrent();
      current = {
        slot: slotFromHeading(value, allowedSlots),
        caption: "",
        path: "",
        visibility: "public"
      };
      continue;
    }

    current ||= { slot: "", caption: "", path: "", visibility: "public" };
    const field = parseField(value);
    const fieldName = field ? fieldNames.get(field.label) : "";

    if (fieldName) {
      current[fieldName] = fieldName === "slot" ? slotFromHeading(field.value, allowedSlots) : field.value;
    } else if (value.startsWith("/assets/")) {
      current.path = value;
    } else {
      current.caption = [current.caption, value].filter(Boolean).join("\n");
    }
  }

  pushCurrent();
  return assets.slice(0, TEXT_LIMITS.assets);
}

export function projectFromDocx(buffer) {
  const paragraphs = paragraphsFromDocx(buffer);
  const sections = splitSections(paragraphs, PROJECT_SECTIONS);
  const metadata = fieldMap(sections.get("metadata"));
  const { title, subtitle } = extractTitleAndSubtitle(paragraphs, PROJECT_SECTIONS, "Imported case study");

  return normalizeProject({
    title: fitText(firstField(metadata, ["title"]) || title, PROJECT_FIELD_LIMITS.title),
    subtitle: fitText(firstField(metadata, ["subtitle"]) || subtitle, PROJECT_FIELD_LIMITS.subtitle),
    year: fitText(firstField(metadata, ["year"]), PROJECT_FIELD_LIMITS.year),
    sector: fitText(firstField(metadata, ["sector"]), PROJECT_FIELD_LIMITS.sector),
    clientType: fitText(firstField(metadata, ["client type", "client"]), PROJECT_FIELD_LIMITS.clientType),
    role: fitText(firstField(metadata, ["role"]), PROJECT_FIELD_LIMITS.role),
    collaborators: splitItems(firstField(metadata, ["collaborators", "collaborator"])).map(item => fitText(item, TEXT_LIMITS.short)).slice(0, TEXT_LIMITS.listItems),
    context: sectionText(sections, "context", PROJECT_FIELD_LIMITS.context),
    challenge: sectionText(sections, "challenge", PROJECT_FIELD_LIMITS.challenge),
    audience: sectionText(sections, "audience", PROJECT_FIELD_LIMITS.audience),
    approach: sectionText(sections, "approach", PROJECT_FIELD_LIMITS.approach),
    keyDecisions: parseTitleDescriptionList(sections.get("keyDecisions"), "title", PROJECT_FIELD_LIMITS.titleListTitle, PROJECT_FIELD_LIMITS.titleListDescription),
    outputs: parseTitleDescriptionList(sections.get("outputs"), "title", PROJECT_FIELD_LIMITS.titleListTitle, PROJECT_FIELD_LIMITS.titleListDescription),
    impact: parseImpactList(sections.get("impact")),
    reflection: sectionText(sections, "reflection", PROJECT_FIELD_LIMITS.reflection),
    confidentialityNotes: sectionText(sections, "confidentialityNotes", PROJECT_FIELD_LIMITS.confidentialityNotes),
    assets: parseAssets(sections.get("assets"), new Set(["", "cover", "decisions", "outputs"]))
  });
}

export function bdDocumentFromDocx(buffer) {
  const paragraphs = paragraphsFromDocx(buffer);
  const sections = splitSections(paragraphs, BD_SECTIONS);
  const metadata = fieldMap(sections.get("metadata"));
  const callsToAction = fieldMap(sections.get("callsToAction"));
  const { title, subtitle } = extractTitleAndSubtitle(paragraphs, BD_SECTIONS, "Imported business development document");

  return normalizeBdDocument({
    title: fitText(firstField(metadata, ["title"]) || title, BD_FIELD_LIMITS.title),
    subtitle: fitText(firstField(metadata, ["subtitle"]) || subtitle, BD_FIELD_LIMITS.subtitle),
    year: fitText(firstField(metadata, ["year"]), BD_FIELD_LIMITS.year),
    audience: fitText(firstField(metadata, ["audience"]), BD_FIELD_LIMITS.audience),
    positioning: sectionText(sections, "positioning", BD_FIELD_LIMITS.positioning),
    executivePromise: sectionText(sections, "executivePromise", BD_FIELD_LIMITS.executivePromise),
    buyerProblems: parseTitleDescriptionList(sections.get("buyerProblems"), "title", BD_FIELD_LIMITS.titleListTitle, BD_FIELD_LIMITS.titleListDescription),
    offerPillars: parseOfferPillars(sections.get("offerPillars")),
    processSummary: sectionText(sections, "processSummary", BD_FIELD_LIMITS.processSummary),
    process: parseTitleDescriptionList(sections.get("process"), "title", BD_FIELD_LIMITS.titleListTitle, BD_FIELD_LIMITS.titleListDescription),
    proofSections: parseProofSections(sections.get("proofSections")),
    engagementModels: parseEngagementModels(sections.get("engagementModels")),
    nextSteps: sectionText(sections, "nextSteps", BD_FIELD_LIMITS.nextSteps),
    primaryCta: fitText(firstField(callsToAction, ["primary cta", "primary"]), BD_FIELD_LIMITS.primaryCta),
    secondaryCta: fitText(firstField(callsToAction, ["secondary cta", "secondary"]), BD_FIELD_LIMITS.secondaryCta),
    confidentialityNotes: sectionText(sections, "confidentialityNotes", BD_FIELD_LIMITS.confidentialityNotes),
    assets: parseAssets(sections.get("assets"), new Set(["", "cover"]))
  });
}

export function isDocxBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
