import { html, joinHtml } from "../lib/html.js";
import { renderDocument } from "./layout.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function asLines(value) {
  return Array.isArray(value) ? value : String(value ?? "").split("\n");
}

function objectTitle(item, fallback) {
  if (typeof item === "string") {
    return item;
  }

  return asText(item?.title || item?.metric || fallback);
}

function objectBody(item) {
  if (typeof item === "string") {
    return "";
  }

  return asText(item?.description || item?.body || item?.summary);
}

function paragraphs(value, className = "") {
  const blocks = asText(value).split(/\n{2,}/).map(block => block.trim()).filter(Boolean);

  return joinHtml(blocks.map(block => html`<p class="${className}">${block}</p>`));
}

function chips(items) {
  return html`<div class="chips">
    ${items.filter(Boolean).map(item => html`<span class="chip">${item}</span>`)}
  </div>`;
}

function detail(label, value) {
  if (!asText(value)) {
    return "";
  }

  return html`<div class="detail">
    <dt>${label}</dt>
    <dd>${value}</dd>
  </div>`;
}

function cardGrid(items, emptyLabel = "No source entries yet.") {
  const entries = asArray(items);

  if (!entries.length) {
    return html`<aside class="note-panel note-panel--light">
      <h3>${emptyLabel}</h3>
      <p>Update the source case study to include this material in the generated engineering report.</p>
    </aside>`;
  }

  return html`<div class="card-grid">
    ${entries.map((item, index) => html`<article class="story-card">
      <span class="story-card__index">${String(index + 1).padStart(2, "0")}</span>
      <h3>${objectTitle(item, `Item ${index + 1}`)}</h3>
      ${objectBody(item) ? html`<p>${objectBody(item)}</p>` : ""}
    </article>`)}
  </div>`;
}

function assetFrame(asset, ratio = "wide") {
  if (!asset) {
    return "";
  }

  return html`<figure class="asset-frame asset-frame--${ratio}">
    <img src="${asset.path}" alt="${asset.caption || "Engineering report visual asset"}">
    <figcaption>
      <span>${asset.caption}</span>
      <span class="asset-status">${asset.visibility || "public"}</span>
    </figcaption>
  </figure>`;
}

function numericImpactItems(items) {
  return asArray(items)
    .map((item, index) => ({
      metric: objectTitle(item, `Metric ${index + 1}`),
      value: item?.value === null || item?.value === undefined || item?.value === "" ? null : Number(item.value),
      unit: asText(item?.unit),
      description: objectBody(item)
    }))
    .filter(item => Number.isFinite(item.value));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2
  }).format(value);
}

function formatImpactValue(item) {
  const value = formatNumber(item.value);

  if (!item.unit) {
    return value;
  }

  return ["%", "x", "X"].includes(item.unit) ? `${value}${item.unit}` : `${value} ${item.unit}`;
}

function impactSection(items) {
  const numericItems = numericImpactItems(items);

  if (!numericItems.length) {
    return cardGrid(items, "No measured signals yet.");
  }

  const maxValue = Math.max(...numericItems.map(item => Math.abs(item.value)), 1);

  return html`<div class="impact-layout">
    <div class="impact-visual" aria-label="Engineering report measurement signals">
      ${numericItems.map(item => html`<article class="impact-row">
        <div class="impact-row__header">
          <h3>${item.metric}</h3>
          <strong>${formatImpactValue(item)}</strong>
        </div>
        <meter class="impact-meter" min="0" max="${maxValue}" value="${Math.abs(item.value)}">${formatImpactValue(item)}</meter>
        ${item.description ? html`<p>${item.description}</p>` : ""}
      </article>`)}
    </div>
  </div>`;
}

function page({ tone = "light", className = "", number, eyebrow, title, children }) {
  return html`<section class="case-page case-page--${tone}${className ? ` ${className}` : ""}">
    <header class="page-topline">
      <span>${eyebrow}</span>
      <span>${number}</span>
    </header>
    <div class="page-content">
      <h2>${title}</h2>
      ${children}
    </div>
  </section>`;
}

function reportImageGallery(images = [], { editable = false, interactive = true } = {}) {
  const imageItems = asArray(images);
  const countClass = reportImageGalleryCountClass(imageItems.length);

  if (!imageItems.length && !editable) {
    return "";
  }

  const galleryAttribute = interactive ? " data-report-image-gallery" : "";
  const gridAttribute = interactive ? " data-report-image-grid" : "";
  const emptyAttribute = interactive ? " data-report-image-empty" : "";

  return html`<section class="report-image-gallery ${countClass}"${galleryAttribute}>
    <div class="report-image-grid"${gridAttribute}>
      ${imageItems.map(image => html`<figure class="report-image-card">
        <img src="${image.path}" alt="${reportImageAltText(image)}">
        ${reportImageCaption(image)}
      </figure>`)}
    </div>
    <p class="report-image-empty"${emptyAttribute} ${imageItems.length ? "hidden" : ""}>No images added yet.</p>
  </section>`;
}

function reportImageGalleryCountClass(count) {
  if (count <= 0) {
    return "report-image-gallery--empty";
  }

  if (count === 1) {
    return "report-image-gallery--single";
  }

  if (count === 2) {
    return "report-image-gallery--pair";
  }

  if (count === 3) {
    return "report-image-gallery--trio";
  }

  return "report-image-gallery--quad";
}

function looksLikeImageFilename(value) {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(asText(value));
}

function reportImageCaptionText(image) {
  const caption = asText(image?.caption);

  return caption && !looksLikeImageFilename(caption) ? caption : "";
}

function reportImageCopyrightText(image) {
  return asText(image?.copyright || image?.credit || image?.rights);
}

function reportImageAltText(image) {
  return reportImageCaptionText(image) || "Engineering report visual";
}

function reportImageCaption(image) {
  const caption = reportImageCaptionText(image);
  const copyright = reportImageCopyrightText(image);

  if (!caption && !copyright) {
    return "";
  }

  return html`<figcaption>
    ${caption ? html`<span>${caption}</span>` : ""}
    ${copyright ? html`<small>${copyright}</small>` : ""}
  </figcaption>`;
}

function reportSpreadsheetList(spreadsheets = [], { editable = false, interactive = true } = {}) {
  const spreadsheetItems = asArray(spreadsheets);

  if (!spreadsheetItems.length && !editable) {
    return "";
  }

  const listAttribute = interactive ? " data-report-spreadsheet-list" : "";
  const countAttribute = interactive ? " data-report-spreadsheet-count" : "";
  const emptyAttribute = interactive ? " data-report-spreadsheet-empty" : "";

  return html`<section class="report-spreadsheet-list${spreadsheetItems.length ? "" : " report-spreadsheet-list--empty"}"${listAttribute}>
    <header>
      <h3>Spreadsheet attachments</h3>
      <span${countAttribute}>${spreadsheetItems.length}</span>
    </header>
    <div class="report-spreadsheet-grid">
      ${spreadsheetItems.map(spreadsheet => html`<a class="report-spreadsheet-card" href="${spreadsheet.path}" download>
        <span>${spreadsheet.caption || spreadsheet.fileName || "Spreadsheet attachment"}</span>
        <strong>${spreadsheet.fileName || "Download"}</strong>
      </a>`)}
    </div>
    <p class="report-spreadsheet-empty"${emptyAttribute} ${spreadsheetItems.length ? "hidden" : ""}>No spreadsheets added yet.</p>
  </section>`;
}

function outlinePath(report, part, slug = "") {
  const suffix = slug ? `/${slug}` : "";

  return `/engineering-report/${report.slug}${part ? `/${part}` : ""}${suffix}`;
}

function outlineExportPath(report, part, slug = "") {
  const suffix = slug ? `/${slug}` : "";

  return `/api/export/engineering/${part}/${report.slug}${suffix}`;
}

function outlineSubsectionEditPath(report, subsection) {
  return `${outlinePath(report, "subsections", subsection.slug)}/edit`;
}

function outlineSectionEditPath(report, section) {
  return `${outlinePath(report, "sections", section.slug)}/edit`;
}

const MARKDOWN_GROUP_PAGE_LIMIT = 33;
const SECTION_BODY_PAGE_LIMIT = 28;
const REPORT_CONTENTS_PAGE_LIMIT = 68;
const SUBSECTION_BODY_PAGE_LIMIT = 31;
const SUBSECTION_STATUSES = [
  ["not-started", "Not started"],
  ["drafting", "Drafting"],
  ["review", "In review"],
  ["approved", "Approved"]
];
const SUBSECTION_STATUS_LABELS = Object.fromEntries(SUBSECTION_STATUSES);

function markdownTable(rows) {
  const [header = [], , ...body] = rows.map(row => row.split("|").slice(1, -1).map(cell => cell.trim()));

  return html`<div class="markdown-table-scroll">
    <table>
      <thead>
        <tr>${header.map(cell => html`<th>${inlineMarkdown(cell)}</th>`)}</tr>
      </thead>
      <tbody>
        ${body.map(row => html`<tr>${row.map(cell => html`<td>${inlineMarkdown(cell)}</td>`)}</tr>`)}
      </tbody>
    </table>
  </div>`;
}

function inlineTokenAt(text, index) {
  if (text.startsWith("**", index)) {
    return {
      marker: "**",
      tag: "strong"
    };
  }

  if (text.startsWith("__", index)) {
    return {
      marker: "__",
      tag: "strong"
    };
  }

  if (text[index] === "*") {
    return {
      marker: "*",
      tag: "em"
    };
  }

  if (text[index] === "_") {
    return {
      marker: "_",
      tag: "em"
    };
  }

  return null;
}

function renderInlineToken(tag, children) {
  return tag === "strong" ? html`<strong>${children}</strong>` : html`<em>${children}</em>`;
}

function inlineMarkdown(value) {
  const text = String(value ?? "");
  const parts = [];
  let index = 0;

  while (index < text.length) {
    const token = inlineTokenAt(text, index);

    if (!token) {
      const nextTokenIndex = ["**", "__", "*", "_"]
        .map(marker => text.indexOf(marker, index + 1))
        .filter(item => item !== -1)
        .sort((a, b) => a - b)[0] ?? text.length;

      parts.push(text.slice(index, nextTokenIndex));
      index = nextTokenIndex;
      continue;
    }

    const contentStart = index + token.marker.length;
    const contentEnd = text.indexOf(token.marker, contentStart);

    if (contentEnd === -1 || contentEnd === contentStart) {
      parts.push(text[index]);
      index += 1;
      continue;
    }

    parts.push(renderInlineToken(token.tag, inlineMarkdown(text.slice(contentStart, contentEnd))));
    index = contentEnd + token.marker.length;
  }

  return joinHtml(parts);
}

function isParagraphHeadingLine(line) {
  const text = asText(line)
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ");

  return text.length > 0 && text.length <= 96 && /:$/.test(text);
}

function parseMarkdownHeadingLine(line) {
  const match = line.match(/^(#{1,5})\s+(.+?)\s*#*\s*$/);

  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    text: match[2].trim()
  };
}

function markdownBlocks(value) {
  const lines = asLines(value);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line || line === "---") {
      index += 1;
      continue;
    }

    const heading = parseMarkdownHeadingLine(line);

    if (heading) {
      blocks.push({
        type: "heading",
        level: heading.level,
        text: heading.text
      });
      index += 1;
      continue;
    }

    if (line.startsWith("|")) {
      const rows = [];

      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(lines[index].trim());
        index += 1;
      }

      if (rows.length >= 2) {
        blocks.push({
          type: "table",
          rows
        });
      }
      continue;
    }

    if (line.startsWith("- ")) {
      const items = [];

      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().replace(/^-\s+/, ""));
        index += 1;
      }

      blocks.push({
        type: "ul",
        items
      });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push({
        type: "ol",
        items
      });
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines = [];

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({
        type: "blockquote",
        items: quoteLines
      });
      continue;
    }

    const paragraphLines = [];

    while (index < lines.length) {
      const nextLine = lines[index].trim();

      if (!nextLine || nextLine === "---" || nextLine.startsWith("|") || nextLine.startsWith("- ") || nextLine.startsWith(">") || /^\d+\.\s+/.test(nextLine)) {
        break;
      }

      if (paragraphLines.length && isParagraphHeadingLine(nextLine)) {
        break;
      }

      paragraphLines.push(nextLine);
      index += 1;

      if (isParagraphHeadingLine(nextLine)) {
        break;
      }
    }

    const text = paragraphLines.join(" ");

    blocks.push({
      type: "paragraph",
      text,
      isHeading: isParagraphHeadingLine(text)
    });
  }

  return blocks;
}

function isMarkdownBlock(value) {
  return Boolean(value && typeof value === "object" && typeof value.type === "string");
}

function normalizeMarkdownBlocks(value) {
  return Array.isArray(value) && value.every(isMarkdownBlock) ? value : markdownBlocks(value);
}

function renderMarkdownBlock(block) {
  if (block.type === "heading") {
    const level = Math.min(Math.max(Number(block.level) || 1, 1), 5);
    const className = `markdown-heading markdown-heading--level-${level}`;

    if (level === 1) {
      return html`<h1 class="${className}">${inlineMarkdown(block.text)}</h1>`;
    }

    if (level === 2) {
      return html`<h2 class="${className}">${inlineMarkdown(block.text)}</h2>`;
    }

    if (level === 3) {
      return html`<h3 class="${className}">${inlineMarkdown(block.text)}</h3>`;
    }

    if (level === 4) {
      return html`<h4 class="${className}">${inlineMarkdown(block.text)}</h4>`;
    }

    return html`<h5 class="${className}">${inlineMarkdown(block.text)}</h5>`;
  }

  if (block.type === "table") {
    return markdownTable(block.rows);
  }

  if (block.type === "ul") {
    return html`<ul>${block.items.map(item => html`<li>${inlineMarkdown(item)}</li>`)}</ul>`;
  }

  if (block.type === "ol") {
    return html`<ol>${block.items.map(item => html`<li>${inlineMarkdown(item)}</li>`)}</ol>`;
  }

  if (block.type === "blockquote") {
    return html`<blockquote>${block.items.map(item => html`<p>${inlineMarkdown(item)}</p>`)}</blockquote>`;
  }

  return html`<p class="${block.isHeading ? "markdown-paragraph-heading" : ""}">${inlineMarkdown(block.text)}</p>`;
}

function renderMarkdownBlocks(value) {
  const blocks = normalizeMarkdownBlocks(value);

  if (!blocks.length) {
    return "";
  }

  return html`<div class="markdown-content">${blocks.map(renderMarkdownBlock)}</div>`;
}

function estimatedTextLines(value, width = 72) {
  return Math.max(1, Math.ceil(asText(value).length / width));
}

function markdownBlockWeight(block) {
  if (block.type === "heading") {
    const weights = {
      1: 2.7,
      2: 2.35,
      3: 2,
      4: 1.7,
      5: 1.5
    };

    return (weights[block.level] || weights[5]) + estimatedTextLines(block.text, 64) * 0.55;
  }

  if (block.type === "table") {
    return 2.4 + Math.max(1, block.rows.length - 2) * 1.55;
  }

  if (block.type === "ul" || block.type === "ol") {
    return 1 + block.items.reduce((total, item) => total + estimatedTextLines(item, 64) * 1.15, 0);
  }

  if (block.type === "blockquote") {
    return 1.2 + block.items.reduce((total, item) => total + estimatedTextLines(item, 68) * 1.1, 0);
  }

  return block.isHeading ? 1.8 : 0.8 + estimatedTextLines(block.text, 76) * 1.15;
}

function markdownBlocksWeight(blocks) {
  return blocks.reduce((total, block) => total + markdownBlockWeight(block), 0);
}

function isMarkdownHeadingBlock(block) {
  return block.type === "heading" || block.isHeading;
}

function findHeadingBreakIndex(blocks) {
  for (let index = blocks.length - 1; index > 0; index -= 1) {
    if (isMarkdownHeadingBlock(blocks[index])) {
      return index;
    }
  }

  return -1;
}

function splitMarkdownBlocksAtHeadings(value, limit) {
  const blocks = normalizeMarkdownBlocks(value);
  const pages = [];
  let current = [];
  let currentWeight = 0;

  blocks.forEach(block => {
    const blockWeight = markdownBlockWeight(block);

    if (current.length && currentWeight + blockWeight > limit) {
      if (isMarkdownHeadingBlock(block)) {
        pages.push(current);
        current = [];
        currentWeight = 0;
      } else {
        const breakIndex = findHeadingBreakIndex(current);

        if (breakIndex > 0) {
          const carry = current.slice(breakIndex);

          pages.push(current.slice(0, breakIndex));
          current = carry;
          currentWeight = markdownBlocksWeight(carry);
        }

        if (current.length && currentWeight + blockWeight > limit) {
          pages.push(current);
          current = [];
          currentWeight = 0;
        }
      }
    }

    current.push(block);
    currentWeight += blockWeight;
  });

  if (current.length) {
    pages.push(current);
  }

  return pages;
}

function continuedTitle(title, index) {
  return index ? `${title} (continued)` : title;
}

function continuedNumber(number, index) {
  if (!index) {
    return number || "";
  }

  return number ? `${number} part ${index + 1}` : `Part ${index + 1}`;
}

function splitImages(images, size = 4) {
  const imageItems = asArray(images);
  const pages = [];

  for (let index = 0; index < imageItems.length; index += size) {
    pages.push(imageItems.slice(index, index + size));
  }

  return pages;
}

function imageChunkWeight(images) {
  const count = images.length;

  if (count <= 0) return 0;
  if (count === 1) return 14;
  if (count === 2) return 15.5;
  if (count === 3) return 22;
  return 24;
}

function canIntegrateImageChunk(blocks, images, limit) {
  if (!images.length) {
    return false;
  }

  if (!blocks.length) {
    return true;
  }

  return markdownBlocksWeight(blocks) + imageChunkWeight(images) <= limit;
}

function outlineImagePages(imagePages, options = {}) {
  const startIndex = Number.isInteger(options.startIndex) ? options.startIndex : 0;

  return joinHtml(imagePages.map((imageChunk, index) => page({
    tone: options.tone || "light",
    number: continuedNumber(options.number || "", startIndex + index),
    eyebrow: options.eyebrow,
    title: continuedTitle(options.title, startIndex + index),
    children: reportImageGallery(imageChunk, {
      editable: Boolean(options.editable) && index === 0,
      interactive: Boolean(options.editable) && options.interactive !== false && index === 0
    })
  })));
}

function outlineSpreadsheetPages(spreadsheets, options = {}) {
  const spreadsheetItems = asArray(spreadsheets);

  if (!spreadsheetItems.length) {
    return "";
  }

  return page({
    tone: options.tone || "light",
    number: continuedNumber(options.number || "", Number.isInteger(options.startIndex) ? options.startIndex : 0),
    eyebrow: options.eyebrow,
    title: `${options.title} spreadsheets`,
    children: reportSpreadsheetList(spreadsheetItems, {
      editable: Boolean(options.editable),
      interactive: Boolean(options.editable)
    })
  });
}

function sectionDraft(section) {
  return {
    body: asText(section?.draft?.body),
    updatedAt: asText(section?.draft?.updatedAt)
  };
}

function sectionBodyLines(section) {
  const draft = sectionDraft(section);
  const body = asArray(section.bodyLines);

  if (!draft.body) {
    return body;
  }

  return [
    ...body,
    ...asLines(draft.body).map(line => line.trim()).filter(Boolean)
  ];
}

function subsectionDraft(subsection) {
  return {
    body: asText(subsection?.draft?.body),
    status: SUBSECTION_STATUS_LABELS[subsection?.draft?.status] ? subsection.draft.status : "not-started",
    owner: asText(subsection?.draft?.owner),
    updatedAt: asText(subsection?.draft?.updatedAt)
  };
}

function hasSubsectionReportContent(subsection) {
  return Boolean(subsectionDraft(subsection).body || asArray(subsection.images).length);
}

function formatDraftDate(value) {
  if (!asText(value)) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function statusOptions(selectedStatus) {
  return SUBSECTION_STATUSES.map(([value, label]) => html`<option value="${value}"${selectedStatus === value ? " selected" : ""}>${label}</option>`);
}

function sectionLabel(section) {
  return section.number ? `${section.number}. ${sectionContentsTitle(section)}` : section.title;
}

function sectionContentsTitle(section) {
  const title = asText(section.title);
  const number = asText(section.number);

  if (number && title.toLowerCase().startsWith(number.toLowerCase())) {
    return title.slice(number.length).replace(/^[:.\s-]+/, "").trim() || title;
  }

  return title;
}

function contentHeadingEntries(value) {
  return normalizeMarkdownBlocks(value)
    .filter(block => block.type === "heading" && Number(block.level) <= 3)
    .map(block => ({
      level: 3,
      number: "",
      title: block.text,
      type: "heading"
    }));
}

function reportContentsEntries(report) {
  return report.groups.flatMap((group, groupIndex) => {
    const entries = [{
      level: 1,
      number: `Chapter ${String(groupIndex + 1).padStart(2, "0")}`,
      title: group.title,
      type: "chapter"
    }];

    if (!group.sections.length) {
      const groupHeadings = contentHeadingEntries(group.bodyLines);

      return [
        ...entries,
        ...(groupHeadings.length ? groupHeadings : [{
          level: 2,
          number: "Notes",
          title: "Chapter narrative",
          type: "section"
        }])
      ];
    }

    group.sections.forEach(section => {
      entries.push({
        level: 2,
        number: section.number || "Section",
        title: sectionContentsTitle(section),
        type: "section"
      });
      entries.push(...contentHeadingEntries(sectionBodyLines(section)));

      section.subsections.forEach(subsection => {
        entries.push({
          level: 3,
          number: subsection.number || "Subsection",
          title: subsection.title,
          type: "subsection"
        });
        entries.push(...contentHeadingEntries(subsectionDraft(subsection).body));
      });
    });

    return entries;
  });
}

function reportContentsEntryWeight(entry) {
  const baseWeight = {
    1: 1.9,
    2: 1,
    3: 0.68
  }[entry.level] || 0.68;
  const width = entry.level === 1 ? 56 : entry.level === 2 ? 44 : 38;

  return baseWeight + (estimatedTextLines(entry.title, width) - 1) * 0.44;
}

function splitReportContentsEntries(report) {
  const pages = [];
  let current = [];
  let currentWeight = 0;

  reportContentsEntries(report).forEach(entry => {
    const entryWeight = reportContentsEntryWeight(entry);

    if (current.length && currentWeight + entryWeight > REPORT_CONTENTS_PAGE_LIMIT) {
      pages.push(current);
      current = [];
      currentWeight = 0;
    }

    current.push(entry);
    currentWeight += entryWeight;
  });

  if (current.length) {
    pages.push(current);
  }

  return pages;
}

function reportContentsEntry(entry) {
  return html`<article class="report-contents__entry report-contents__entry--level-${entry.level} report-contents__entry--${entry.type}">
    <span>${entry.number}</span>
    <p>${entry.title}</p>
  </article>`;
}

function subsectionLabel(subsection) {
  return subsection.number ? `${subsection.number} ${subsection.title}` : subsection.title;
}

function chapterContentsList(group) {
  const sections = asArray(group.sections);

  if (!sections.length) {
    return html`<article class="chapter-content-row chapter-content-row--empty">
      <div>
        <span>Notes</span>
        <h3>Chapter narrative</h3>
        <p>This chapter contains supporting report text rather than numbered work packages.</p>
      </div>
    </article>`;
  }

  return html`${sections.map(section => html`<article class="chapter-content-row">
    <div>
      <span>${section.number || "Section"}</span>
      <h3>${sectionContentsTitle(section)}</h3>
    </div>
    <strong>${section.subsections.length} ${section.subsections.length === 1 ? "subsection" : "subsections"}</strong>
  </article>`)}`;
}

function chapterDividerPage(group, index) {
  const sections = asArray(group.sections);
  const subsectionCount = sections.reduce((total, section) => total + section.subsections.length, 0);
  const countLabel = sections.length
    ? `${sections.length} ${sections.length === 1 ? "section" : "sections"} / ${subsectionCount} ${subsectionCount === 1 ? "subsection" : "subsections"}`
    : "Narrative chapter";

  return page({
    tone: index % 2 === 0 ? "dark" : "light",
    number: `Chapter ${String(index + 1).padStart(2, "0")}`,
    eyebrow: "Chapter contents",
    title: group.title,
    children: html`<div class="chapter-divider">
      <div class="chapter-divider__summary">
        <span>${countLabel}</span>
      </div>
      <div class="chapter-content-list">
        ${chapterContentsList(group)}
      </div>
    </div>`
  });
}

function reportContentsPage(report) {
  return joinHtml(splitReportContentsEntries(report).map((entries, pageIndex) => page({
    tone: "light",
    className: "case-page--contents",
    number: continuedNumber("Contents", pageIndex),
    eyebrow: "Report contents",
    title: continuedTitle("Contents", pageIndex),
    children: html`<div class="report-contents report-contents--detailed">
      ${entries.map(reportContentsEntry)}
    </div>`
  })));
}

function outlineSectionPage(report, section, options = {}) {
  const editable = Boolean(options.editable);
  const bodyPages = splitMarkdownBlocksAtHeadings(sectionBodyLines(section), SECTION_BODY_PAGE_LIMIT);
  const pageCount = Math.max(bodyPages.length, 1);
  const imageItems = asArray(section.images);
  const imageChunks = splitImages(imageItems);
  const firstImageChunk = imageChunks[0] || [];
  const integratedImageChunk = canIntegrateImageChunk(bodyPages[pageCount - 1] || [], firstImageChunk, SECTION_BODY_PAGE_LIMIT)
    ? firstImageChunk
    : [];
  const remainingImageChunks = integratedImageChunk.length ? imageChunks.slice(1) : imageChunks;
  const spreadsheetItems = asArray(section.spreadsheets);

  const sectionPages = Array.from({ length: pageCount }, (_, index) => {
    const bodyBlocks = bodyPages[index] || [];
    const hasBody = bodyBlocks.length > 0;
    const isLastBodyPage = index === pageCount - 1;

    return page({
      tone: options.tone || "light",
      number: continuedNumber(section.number || options.number || "", index),
      eyebrow: section.groupTitle,
      title: continuedTitle(sectionLabel(section), index),
      children: html`${hasBody ? html`<div class="outline-section-layout outline-section-layout--single">
        <div class="editorial-column">${renderMarkdownBlocks(bodyBlocks)}
        ${isLastBodyPage && integratedImageChunk.length ? reportImageGallery(integratedImageChunk, { editable }) : ""}</div>
      </div>` : ""}
      ${!hasBody && isLastBodyPage && integratedImageChunk.length ? reportImageGallery(integratedImageChunk, { editable }) : ""}
      ${editable && !imageItems.length && isLastBodyPage ? reportImageGallery([], { editable }) : ""}
      ${editable && !spreadsheetItems.length && index === pageCount - 1 ? reportSpreadsheetList([], { editable }) : ""}`
    });
  });

  return joinHtml([
    sectionPages,
    outlineImagePages(remainingImageChunks, {
      editable,
      tone: options.tone || "light",
      number: section.number || options.number || "",
      startIndex: pageCount,
      eyebrow: section.groupTitle,
      title: sectionLabel(section),
      interactive: !integratedImageChunk.length
    }),
    outlineSpreadsheetPages(spreadsheetItems, {
      editable,
      tone: options.tone || "light",
      number: section.number || options.number || "",
      startIndex: pageCount + remainingImageChunks.length,
      eyebrow: section.groupTitle,
      title: sectionLabel(section)
    })
  ]);
}

function outlineSubsectionPage(subsection, options = {}) {
  const editable = Boolean(options.editable);
  const imageItems = asArray(subsection.images);
  const draft = subsectionDraft(subsection);
  const bodyPages = draft.body ? splitMarkdownBlocksAtHeadings(draft.body, SUBSECTION_BODY_PAGE_LIMIT) : [];
  const pageCount = Math.max(bodyPages.length, 1);
  const imageChunks = splitImages(imageItems);
  const firstImageChunk = imageChunks[0] || [];
  const integratedImageChunk = canIntegrateImageChunk(bodyPages[pageCount - 1] || [], firstImageChunk, SUBSECTION_BODY_PAGE_LIMIT)
    ? firstImageChunk
    : [];
  const remainingImageChunks = integratedImageChunk.length ? imageChunks.slice(1) : imageChunks;

  const subsectionPages = Array.from({ length: pageCount }, (_, index) => {
    const bodyBlocks = bodyPages[index] || [];
    const hasBody = bodyBlocks.length > 0;
    const isLastBodyPage = index === pageCount - 1;

    return page({
      tone: "light",
      number: continuedNumber(subsection.number, index),
      eyebrow: subsection.groupTitle,
      title: continuedTitle(subsection.title, index),
      children: hasBody
        ? html`<div class="outline-section-layout outline-section-layout--single">
          <div class="editorial-column">${renderMarkdownBlocks(bodyBlocks)}
          ${isLastBodyPage && integratedImageChunk.length ? reportImageGallery(integratedImageChunk, { editable }) : ""}</div>
        </div>`
        : html`<div class="lead-block">
          <p class="lead">This subsection is ready for focused authorship and export.</p>
        </div>
        ${isLastBodyPage && integratedImageChunk.length ? reportImageGallery(integratedImageChunk, { editable }) : ""}
        ${editable && !imageItems.length ? reportImageGallery([], { editable }) : ""}`
    });
  });

  return joinHtml([
    subsectionPages,
    outlineImagePages(remainingImageChunks, {
      editable,
      tone: "light",
      number: subsection.number,
      startIndex: pageCount,
      eyebrow: subsection.groupTitle,
      title: subsection.title,
      interactive: !integratedImageChunk.length
    })
  ]);
}

function outlineCover(report) {
  return html`<section class="case-page case-page--dark case-page--cover outline-cover">
    <header class="page-topline">
      <span>Engineering report</span>
      <span>${report.sectionCount} sections</span>
    </header>
    <div class="cover-layout">
      <div class="cover-copy">
        ${chips(["Stage 2", "Basis of Design", `${report.subsectionCount} subsections`])}
        <h1>${report.title}</h1>
        ${report.introLines.length ? renderMarkdownBlocks(report.introLines) : ""}
      </div>
    </div>
  </section>`;
}

function outlineToolbar(report, options) {
  const editMode = options.mode === "edit";
  const selectedPart = options.subsection
    ? outlineExportPath(report, "subsection", options.subsection.slug)
    : options.section
      ? outlineExportPath(report, "section", options.section.slug)
      : outlineExportPath(report, "compile");
  const selectedPage = options.subsection
    ? { kind: "subsection", slug: options.subsection.slug }
    : options.section
      ? { kind: "section", slug: options.section.slug }
      : null;

  return html`<nav class="preview-toolbar" aria-label="Engineering report controls">
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/?view=engineering-reports">${editMode ? "Close edit" : "Close preview"}</a>
    ${options.section || options.subsection ? html`<a class="preview-toolbar__link preview-toolbar__link--subtle" href="${outlinePath(report)}">Full report</a>` : ""}
    ${options.section && !editMode ? html`<a class="preview-toolbar__link preview-toolbar__link--subtle" href="${outlineSectionEditPath(report, options.section)}">Edit section</a>` : ""}
    ${options.section && editMode ? html`<a class="preview-toolbar__link preview-toolbar__link--subtle" href="${outlinePath(report, "sections", options.section.slug)}">Preview section</a>` : ""}
    ${options.subsection && !editMode ? html`<a class="preview-toolbar__link preview-toolbar__link--subtle" href="${outlineSubsectionEditPath(report, options.subsection)}">Edit subsection</a>` : ""}
    ${options.subsection && editMode ? html`<a class="preview-toolbar__link preview-toolbar__link--subtle" href="${outlinePath(report, "subsections", options.subsection.slug)}">Preview subsection</a>` : ""}
    ${selectedPage && editMode ? html`<label class="preview-toolbar__link preview-toolbar__link--subtle preview-toolbar__file">
      Add images
      <input
        type="file"
        data-report-image-input
        data-report-slug="${report.slug}"
        data-page-kind="${selectedPage.kind}"
        data-page-slug="${selectedPage.slug}"
        accept="image/svg+xml,image/png,image/jpeg,image/webp"
        multiple>
    </label>
    ${options.section ? html`<label class="preview-toolbar__link preview-toolbar__link--subtle preview-toolbar__file">
      Add spreadsheets
      <input
        type="file"
        data-report-spreadsheet-input
        data-report-slug="${report.slug}"
        data-section-slug="${options.section.slug}"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        multiple>
    </label>` : ""}
    <span class="preview-toolbar__status" data-report-image-status role="status" aria-live="polite"></span>` : html`<span class="preview-toolbar__status" data-download-status role="status" aria-live="polite"></span>`}
    <a class="preview-toolbar__link" href="${selectedPart}" download>Save PDF</a>
  </nav>`;
}

function outlineSubsectionEditor(report, subsection) {
  const draft = subsectionDraft(subsection);

  return html`<section class="subsection-editor" data-subsection-editor data-report-slug="${report.slug}" data-subsection-slug="${subsection.slug}">
    <div class="subsection-editor__inner">
      <header class="subsection-editor__header">
        <div>
          <span>${subsection.number}</span>
          <h2>${subsection.title}</h2>
        </div>
        <span class="subsection-editor__status" data-subsection-save-status role="status" aria-live="polite">
          ${draft.updatedAt ? `Saved ${formatDraftDate(draft.updatedAt)}` : "Not saved"}
        </span>
      </header>
      <form class="subsection-editor__form" data-subsection-editor-form>
        <label>
          <span>Owner</span>
          <input name="owner" value="${draft.owner}" autocomplete="name">
        </label>
        <label>
          <span>Status</span>
          <select name="status">${statusOptions(draft.status)}</select>
        </label>
        <div class="subsection-editor__body">
          <span id="subsection-draft-content-label">Draft content</span>
          <div class="subsection-format-toolbar" aria-label="Text formatting">
            <div class="subsection-format-toolbar__group" role="group" aria-label="Heading level">
              <button type="button" data-subsection-format="heading" data-heading-level="3" aria-label="Heading level 3">H3</button>
              <button type="button" data-subsection-format="heading" data-heading-level="4" aria-label="Heading level 4">H4</button>
              <button type="button" data-subsection-format="heading" data-heading-level="5" aria-label="Heading level 5">H5</button>
            </div>
            <div class="subsection-format-toolbar__group" role="group" aria-label="Text style">
              <button type="button" data-subsection-format="bold" aria-label="Bold selected text"><strong>B</strong></button>
              <button type="button" data-subsection-format="italic" aria-label="Italicise selected text"><em>I</em></button>
            </div>
          </div>
          <textarea name="body" rows="14" aria-labelledby="subsection-draft-content-label">${draft.body}</textarea>
        </div>
        <div class="subsection-editor__actions">
          <button type="submit" data-subsection-save-button>Save subsection</button>
        </div>
      </form>
    </div>
  </section>`;
}

function outlineSectionEditor(report, section) {
  const draft = sectionDraft(section);

  return html`<section class="subsection-editor" data-section-editor data-report-slug="${report.slug}" data-section-slug="${section.slug}">
    <div class="subsection-editor__inner">
      <header class="subsection-editor__header">
        <div>
          <span>${section.number || "Section"}</span>
          <h2>${sectionContentsTitle(section)}</h2>
        </div>
        <span class="subsection-editor__status" data-section-save-status role="status" aria-live="polite">
          ${draft.updatedAt ? `Saved ${formatDraftDate(draft.updatedAt)}` : "Not saved"}
        </span>
      </header>
      <form class="subsection-editor__form" data-section-editor-form>
        <div class="subsection-editor__body">
          <span id="section-draft-content-label">Section text</span>
          <div class="subsection-format-toolbar" aria-label="Text formatting">
            <div class="subsection-format-toolbar__group" role="group" aria-label="Heading level">
              <button type="button" data-section-format="heading" data-heading-level="3" aria-label="Heading level 3">H3</button>
              <button type="button" data-section-format="heading" data-heading-level="4" aria-label="Heading level 4">H4</button>
              <button type="button" data-section-format="heading" data-heading-level="5" aria-label="Heading level 5">H5</button>
            </div>
            <div class="subsection-format-toolbar__group" role="group" aria-label="Text style">
              <button type="button" data-section-format="bold" aria-label="Bold selected text"><strong>B</strong></button>
              <button type="button" data-section-format="italic" aria-label="Italicise selected text"><em>I</em></button>
            </div>
          </div>
          <textarea name="body" rows="12" aria-labelledby="section-draft-content-label">${draft.body}</textarea>
        </div>
        <div class="subsection-editor__actions">
          <button type="submit" data-section-save-button>Save section</button>
        </div>
      </form>
    </div>
  </section>`;
}

export function renderEngineeringOutlineReport(report, options = {}) {
  const editMode = options.mode === "edit";
  const body = html`${outlineToolbar(report, options)}
  ${options.section && editMode ? outlineSectionEditor(report, options.section) : ""}
  ${options.subsection && editMode ? outlineSubsectionEditor(report, options.subsection) : ""}
  <main class="case-study-shell engineering-report-shell">
    ${options.subsection
      ? outlineSubsectionPage(options.subsection, { editable: editMode })
      : options.section
        ? html`${outlineSectionPage(report, options.section, { editable: editMode })}
          ${options.section.subsections.filter(hasSubsectionReportContent).map(subsection => outlineSubsectionPage(subsection))}`
        : html`${outlineCover(report)}
          ${reportContentsPage(report)}
          ${report.groups.map((group, groupIndex) => html`${chapterDividerPage(group, groupIndex)}
          ${group.bodyLines.length ? splitMarkdownBlocksAtHeadings(group.bodyLines, MARKDOWN_GROUP_PAGE_LIMIT).map((bodyBlocks, index) => page({
            tone: "light",
            number: continuedNumber("", index),
            eyebrow: "Report logic",
            title: continuedTitle(group.title, index),
            children: renderMarkdownBlocks(bodyBlocks)
          })) : ""}
          ${group.sections.map((section, index) => html`${outlineSectionPage(report, section, {
            tone: index % 2 === 0 ? "light" : "dark"
          })}
          ${section.subsections.filter(hasSubsectionReportContent).map(subsection => outlineSubsectionPage(subsection))}`)}`)}`}
  </main>`;

  const selectedTitle = options.subsection
    ? `${subsectionLabel(options.subsection)} engineering report subsection${editMode ? " edit" : ""}`
    : options.section
      ? `${sectionLabel(options.section)} engineering report section`
      : `${report.title} compiled engineering report`;

  return renderDocument({
    title: selectedTitle,
    body,
    bodyClass: "case-study-body engineering-report-body",
    styles: ["/pdf/theme.css"],
    scripts: options.section || editMode
      ? ["/app/export-downloads-init.js", "/app/engineering-report.js"]
      : ["/app/export-downloads-init.js"]
  });
}

export function renderEngineeringReport(project, options = {}) {
  const slug = asText(options.slug);
  const visibleAssets = asArray(project.assets).filter(asset => asset.visibility !== "hidden");
  const slottedAssets = new Map(
    visibleAssets
      .filter(asset => asText(asset.slot))
      .map(asset => [asText(asset.slot), asset])
  );
  const legacyAssets = visibleAssets.filter(asset => !asText(asset.slot));
  const coverAsset = slottedAssets.get("cover") || legacyAssets[0];
  const decisionAsset = slottedAssets.get("decisions") || legacyAssets[1];
  const outputAsset = slottedAssets.get("outputs") || legacyAssets[2];
  const reportTitle = `${project.title} engineering report`;
  const snapshotItems = [
    detail("Year", project.year),
    detail("Sector", project.sector),
    detail("Client type", project.clientType),
    detail("Engineering role", project.role),
    detail("Contributors", asArray(project.collaborators).join(", "))
  ];

  const previewToolbar = slug ? html`<nav class="preview-toolbar" aria-label="Engineering report controls">
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/?view=engineering-reports">Close preview</a>
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/builder/${slug}">Edit source</a>
    <span class="preview-toolbar__status" data-download-status role="status" aria-live="polite"></span>
    <a class="preview-toolbar__link" href="/api/export/engineering/pdf/${slug}" download>Save PDF</a>
  </nav>` : "";

  const body = html`${previewToolbar}
  <main class="case-study-shell engineering-report-shell">
    <section class="case-page case-page--dark case-page--cover">
      <header class="page-topline">
        <span>Engineering report</span>
        <span>${project.year}</span>
      </header>
      <div class="cover-layout">
        <div class="cover-copy">
          ${chips([project.sector, project.clientType, project.role])}
          <h1>${project.title}</h1>
          <p class="cover-subtitle">${project.subtitle}</p>
        </div>
        ${assetFrame(coverAsset, "wide")}
      </div>
    </section>

    ${page({
      tone: "light",
      number: "02",
      eyebrow: "Overview",
      title: "System and delivery context",
      children: html`<div class="snapshot-grid">
        <dl class="detail-grid">${snapshotItems}</dl>
        <div class="lead-block">${paragraphs(project.context, "lead")}</div>
      </div>`
    })}

    ${page({
      tone: "dark",
      number: "03",
      eyebrow: "Scope",
      title: "Problem framing and operating constraints",
      children: html`<div class="two-column">
        <div>${paragraphs(project.challenge, "lead")}</div>
        <aside class="note-panel">
          <h3>Audience and review path</h3>
          ${paragraphs(project.audience)}
        </aside>
      </div>`
    })}

    ${page({
      tone: "light",
      number: "04",
      eyebrow: "Approach",
      title: "Engineering approach",
      children: html`<div class="two-column two-column--balanced">
        <div class="editorial-column">${paragraphs(project.approach, "lead")}</div>
        ${assetFrame(decisionAsset, "portrait")}
      </div>`
    })}

    ${page({
      tone: "dark",
      number: "05",
      eyebrow: "Decisions",
      title: "Technical decisions and rationale",
      children: cardGrid(project.keyDecisions, "No technical decisions yet.")
    })}

    ${page({
      tone: "light",
      number: "06",
      eyebrow: "Outputs",
      title: "Generated outputs and implementation artifacts",
      children: html`<div class="two-column two-column--balanced">
        ${cardGrid(project.outputs, "No delivery outputs yet.")}
        ${assetFrame(outputAsset, "wide")}
      </div>`
    })}

    ${page({
      tone: "dark",
      number: "07",
      eyebrow: "Measurement",
      title: "Signals, follow-up and risk controls",
      children: html`<div class="two-column">
        ${impactSection(project.impact)}
        <aside class="note-panel">
          <h3>Follow-up notes</h3>
          ${paragraphs(project.reflection)}
          ${paragraphs(project.confidentialityNotes)}
        </aside>
      </div>`
    })}
  </main>`;

  return renderDocument({
    title: reportTitle,
    body,
    bodyClass: "case-study-body engineering-report-body",
    styles: ["/pdf/theme.css"],
    scripts: slug ? ["/app/export-downloads-init.js"] : []
  });
}
