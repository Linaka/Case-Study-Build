import { html } from "../lib/html.js";
import { renderDocument } from "./layout.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function visibleAssets(source) {
  return asArray(source.assets).filter(asset => asset?.path && asset.visibility !== "hidden");
}

function coverAsset(source) {
  const assets = visibleAssets(source);

  return assets.find(asset => asText(asset.slot) === "cover") || assets[0] || null;
}

function chips(items) {
  return html`<div class="marketing-banner__chips">
    ${items.filter(Boolean).map(item => html`<span>${item}</span>`)}
  </div>`;
}

function visual(asset, label) {
  if (!asset?.path) {
    return html`<div class="marketing-banner__visual marketing-banner__visual--empty" aria-label="${label}">
      <span>${label}</span>
    </div>`;
  }

  return html`<figure class="marketing-banner__visual">
    <img src="${asset.path}" alt="${asset.caption || label}">
  </figure>`;
}

function projectBannerData(project) {
  return {
    accent: "Proof library",
    eyebrow: "Case study",
    title: project.title || "Untitled case study",
    subtitle: project.subtitle || project.challenge || project.context,
    chips: [project.year, project.sector, project.clientType || project.role],
    footer: project.impact?.[0]?.metric || project.role || "Read the case study",
    asset: coverAsset(project)
  };
}

function bdBannerData(document) {
  return {
    accent: "Enterprise sales document",
    eyebrow: "Business development",
    title: document.title || "Untitled BD document",
    subtitle: document.subtitle || document.executivePromise || document.positioning,
    chips: [document.year, document.audience, "Full build support"],
    footer: document.primaryCta || "Strategy through design, build and launch",
    asset: coverAsset(document)
  };
}

export function renderMarketingBanner(source, options = {}) {
  const type = options.type === "bd" ? "bd" : "project";
  const data = type === "bd" ? bdBannerData(source) : projectBannerData(source);
  const body = html`<main class="marketing-banner marketing-banner--${type}">
    <section class="marketing-banner__copy">
      <p class="marketing-banner__accent">${data.accent}</p>
      <div class="marketing-banner__headline">
        <p class="marketing-banner__eyebrow">${data.eyebrow}</p>
        <h1>${data.title}</h1>
        ${asText(data.subtitle) ? html`<p class="marketing-banner__subtitle">${data.subtitle}</p>` : ""}
      </div>
      ${chips(data.chips)}
      <p class="marketing-banner__footer">${data.footer}</p>
    </section>
    ${visual(data.asset, `${data.eyebrow} visual`)}
  </main>`;

  return renderDocument({
    title: `${data.title} marketing banner`,
    body,
    bodyClass: "marketing-banner-body",
    styles: ["/pdf/theme.css"]
  });
}
