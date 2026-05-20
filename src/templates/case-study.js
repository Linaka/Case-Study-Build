import { html, joinHtml } from "../lib/html.js";
import { renderDocument } from "./layout.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
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
  const narrativeItems = asArray(items).filter(item => {
    const value = item?.value === null || item?.value === undefined || item?.value === "" ? null : Number(item.value);
    return !Number.isFinite(value);
  });

  if (!numericItems.length) {
    return cardGrid(items);
  }

  const maxValue = Math.max(...numericItems.map(item => Math.abs(item.value)), 1);

  return html`<div class="impact-layout">
    <div class="impact-visual" aria-label="Impact data visualisation">
      ${numericItems.map(item => html`<article class="impact-row">
        <div class="impact-row__header">
          <h3>${item.metric}</h3>
          <strong>${formatImpactValue(item)}</strong>
        </div>
        <meter class="impact-meter" min="0" max="${maxValue}" value="${Math.abs(item.value)}">${formatImpactValue(item)}</meter>
        ${item.description ? html`<p>${item.description}</p>` : ""}
      </article>`)}
    </div>
    ${narrativeItems.length ? cardGrid(narrativeItems) : ""}
  </div>`;
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

function cardGrid(items, variant = "default") {
  return html`<div class="card-grid card-grid--${variant}">
    ${asArray(items).map((item, index) => html`<article class="story-card">
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
    <img src="${asset.path}" alt="${asset.caption || "Case-study visual asset"}">
    <figcaption>
      <span>${asset.caption}</span>
      <span class="asset-status">${asset.visibility || "public"}</span>
    </figcaption>
  </figure>`;
}

function page({ tone = "light", number, eyebrow, title, children }) {
  return html`<section class="case-page case-page--${tone}">
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

export function renderCaseStudy(project, options = {}) {
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
  const snapshotItems = [
    detail("Year", project.year),
    detail("Sector", project.sector),
    detail("Client type", project.clientType),
    detail("Role", project.role),
    detail("Collaborators", asArray(project.collaborators).join(", "))
  ];

  const previewToolbar = slug ? html`<nav class="preview-toolbar" aria-label="Preview controls">
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/builder/${slug}">Close preview</a>
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/api/export/xlsx/${slug}" download>Excel data</a>
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/api/export/word/${slug}" download>Save Word</a>
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/api/export/banner/${slug}" download>Save banner</a>
    <span class="preview-toolbar__status" data-download-status role="status" aria-live="polite"></span>
    <a class="preview-toolbar__link" href="/api/export/pdf/${slug}" download>Save PDF</a>
  </nav>` : "";

  const body = html`${previewToolbar}
  <main class="case-study-shell">
    <section class="case-page case-page--dark case-page--cover">
      <header class="page-topline">
        <span>Case study</span>
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
      eyebrow: "Snapshot",
      title: "Project snapshot",
      children: html`<div class="snapshot-grid">
        <dl class="detail-grid">${snapshotItems}</dl>
        <div class="lead-block">${paragraphs(project.context, "lead")}</div>
      </div>`
    })}

    ${page({
      tone: "dark",
      number: "03",
      eyebrow: "Challenge",
      title: "Communication challenge",
      children: html`<div class="two-column">
        <div>${paragraphs(project.challenge, "lead")}</div>
        <aside class="note-panel">
          <h3>Audience</h3>
          ${paragraphs(project.audience)}
        </aside>
      </div>`
    })}

    ${page({
      tone: "light",
      number: "04",
      eyebrow: "Approach",
      title: "Approach",
      children: html`<div class="editorial-column">
        ${paragraphs(project.approach, "lead")}
        ${chips(["Source JSON", "HTML preview", "Markdown export", "A4 PDF"])}
      </div>`
    })}

    ${page({
      tone: "dark",
      number: "05",
      eyebrow: "Decisions",
      title: "Key visual decisions",
      children: html`<div class="two-column two-column--balanced">
        ${cardGrid(project.keyDecisions, "compact")}
        ${assetFrame(decisionAsset, "portrait")}
      </div>`
    })}

    ${page({
      tone: "light",
      number: "06",
      eyebrow: "Outputs",
      title: "Outputs",
      children: html`<div class="two-column two-column--balanced">
        ${cardGrid(project.outputs)}
        ${assetFrame(outputAsset, "wide")}
      </div>`
    })}

    ${page({
      tone: "dark",
      number: "07",
      eyebrow: "Impact",
      title: "Impact",
      children: impactSection(project.impact)
    })}

    ${page({
      tone: "light",
      number: "08",
      eyebrow: "Reflection",
      title: "Reflection",
      children: html`<div class="reflection-layout">
        <div>${paragraphs(project.reflection, "lead")}</div>
        <aside class="note-panel note-panel--light">
          <h3>Confidentiality notes</h3>
          ${paragraphs(project.confidentialityNotes)}
        </aside>
      </div>`
    })}
  </main>`;

  return renderDocument({
    title: project.title,
    body,
    bodyClass: "case-study-body",
    styles: ["/pdf/theme.css"],
    scripts: slug ? ["/app/export-downloads-init.js"] : []
  });
}
