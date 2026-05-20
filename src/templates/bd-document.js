import { html, joinHtml } from "../lib/html.js";
import { renderDocument } from "./layout.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
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

function assetFrame(asset, ratio = "wide") {
  if (!asset?.path) {
    return "";
  }

  return html`<figure class="asset-frame asset-frame--${ratio}">
    <img src="${asset.path}" alt="${asset.caption || "Business development visual asset"}">
    <figcaption>
      <span>${asset.caption}</span>
      <span class="asset-status">${asset.visibility || "public"}</span>
    </figcaption>
  </figure>`;
}

function page({ tone = "light", number, eyebrow, title, children }) {
  return html`<section class="case-page bd-page case-page--${tone}">
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

function storyCard(item, index) {
  return html`<article class="story-card bd-story-card">
    <span class="story-card__index">${String(index + 1).padStart(2, "0")}</span>
    <h3>${item.title || `Item ${index + 1}`}</h3>
    ${asText(item.description) ? html`<p>${item.description}</p>` : ""}
  </article>`;
}

function offerCard(item, index) {
  return html`<article class="story-card bd-story-card">
    <span class="story-card__index">${String(index + 1).padStart(2, "0")}</span>
    <h3>${item.title || `Offer ${index + 1}`}</h3>
    ${asText(item.description) ? html`<p>${item.description}</p>` : ""}
    ${asArray(item.deliverables).length ? chips(item.deliverables) : ""}
  </article>`;
}

function processStep(item, index) {
  return html`<article class="bd-process-step">
    <span>${String(index + 1).padStart(2, "0")}</span>
    <div>
      <h3>${item.title || `Step ${index + 1}`}</h3>
      ${asText(item.description) ? html`<p>${item.description}</p>` : ""}
    </div>
  </article>`;
}

function engagementCard(item, index) {
  return html`<article class="story-card bd-story-card">
    <span class="story-card__index">${String(index + 1).padStart(2, "0")}</span>
    <h3>${item.title || `Model ${index + 1}`}</h3>
    <dl class="bd-mini-detail">
      ${asText(item.bestFor) ? html`<div><dt>Best for</dt><dd>${item.bestFor}</dd></div>` : ""}
      ${asText(item.scope) ? html`<div><dt>Scope</dt><dd>${item.scope}</dd></div>` : ""}
      ${asText(item.timeline) ? html`<div><dt>Timeline</dt><dd>${item.timeline}</dd></div>` : ""}
    </dl>
  </article>`;
}

function proofPage(proof, index) {
  const tone = index % 2 === 0 ? "light" : "dark";
  const proofAsset = proof.assetPath
    ? {
        path: proof.assetPath,
        caption: proof.evidence || proof.headline,
        visibility: proof.visibility || "private"
      }
    : null;

  return page({
    tone,
    number: String(index + 6).padStart(2, "0"),
    eyebrow: `Proof ${index + 1}`,
    title: proof.headline || `Proof section ${index + 1}`,
    children: html`<div class="bd-proof-layout">
      <div class="bd-proof-copy">
        ${chips([proof.clientContext, proof.projectSlug ? `Source: ${proof.projectSlug}` : "", proof.visibility || "private"])}
        <dl class="bd-proof-detail">
          ${asText(proof.problem) ? html`<div><dt>Problem</dt><dd>${proof.problem}</dd></div>` : ""}
          ${asText(proof.intervention) ? html`<div><dt>Intervention</dt><dd>${proof.intervention}</dd></div>` : ""}
          ${asText(proof.outcome) ? html`<div><dt>Outcome</dt><dd>${proof.outcome}</dd></div>` : ""}
          ${asText(proof.evidence) ? html`<div><dt>Evidence</dt><dd>${proof.evidence}</dd></div>` : ""}
        </dl>
      </div>
      ${assetFrame(proofAsset, "wide")}
    </div>`
  });
}

export function renderBdDocument(document, options = {}) {
  const slug = asText(options.slug);
  const visibleAssets = asArray(document.assets).filter(asset => asset.visibility !== "hidden");
  const coverAsset = visibleAssets.find(asset => asText(asset.slot) === "cover") || visibleAssets[0];
  const visibleProofs = asArray(document.proofSections).filter(proof => proof.visibility !== "hidden").slice(0, 3);

  const previewToolbar = slug ? html`<nav class="preview-toolbar" aria-label="Preview controls">
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/bd-builder/${slug}">Close preview</a>
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/api/export/bd/word/${slug}" download>Save Word</a>
    <a class="preview-toolbar__link preview-toolbar__link--subtle" href="/api/export/bd/banner/${slug}" download>Save banner</a>
    <span class="preview-toolbar__status" data-download-status role="status" aria-live="polite"></span>
    <a class="preview-toolbar__link" href="/api/export/bd/pdf/${slug}" download>Save PDF</a>
  </nav>` : "";

  const body = html`${previewToolbar}
  <main class="case-study-shell bd-document-shell">
    <section class="case-page bd-page case-page--dark case-page--cover bd-cover">
      <header class="page-topline">
        <span>Business development</span>
        <span>${document.year}</span>
      </header>
      <div class="cover-layout">
        <div class="cover-copy">
          ${chips([document.audience, "Full build support", "Enterprise sales"])}
          <h1>${document.title}</h1>
          <p class="cover-subtitle">${document.subtitle}</p>
        </div>
        ${assetFrame(coverAsset, "wide")}
      </div>
    </section>

    ${page({
      tone: "light",
      number: "02",
      eyebrow: "Promise",
      title: "Executive promise",
      children: html`<div class="bd-promise-grid">
        <div class="editorial-column">
          ${paragraphs(document.executivePromise, "lead")}
          ${paragraphs(document.positioning)}
        </div>
        <aside class="note-panel note-panel--light">
          <h3>Audience</h3>
          ${paragraphs(document.audience)}
        </aside>
      </div>`
    })}

    ${page({
      tone: "dark",
      number: "03",
      eyebrow: "Buyer problems",
      title: "Where we help",
      children: html`<div class="card-grid">
        ${asArray(document.buyerProblems).map(storyCard)}
      </div>`
    })}

    ${page({
      tone: "light",
      number: "04",
      eyebrow: "Offer",
      title: "Strategy through build",
      children: html`<div class="card-grid">
        ${asArray(document.offerPillars).map(offerCard)}
      </div>`
    })}

    ${page({
      tone: "dark",
      number: "05",
      eyebrow: "Process",
      title: "Delivery process",
      children: html`<div class="bd-process-layout">
        <div class="lead-block">${paragraphs(document.processSummary, "lead")}</div>
        <div class="bd-process-list">${asArray(document.process).map(processStep)}</div>
      </div>`
    })}

    ${visibleProofs.map(proofPage)}

    ${page({
      tone: "dark",
      number: "09",
      eyebrow: "Engagement",
      title: "Engagement models",
      children: html`<div class="card-grid">
        ${asArray(document.engagementModels).map(engagementCard)}
      </div>`
    })}

    ${page({
      tone: "light",
      number: "10",
      eyebrow: "Next steps",
      title: "Outcomes and CTA",
      children: html`<div class="bd-cta-layout">
        <div class="editorial-column">
          ${paragraphs(document.nextSteps, "lead")}
          ${chips([document.primaryCta, document.secondaryCta])}
        </div>
        <aside class="note-panel note-panel--light">
          <h3>Confidentiality</h3>
          ${paragraphs(document.confidentialityNotes)}
        </aside>
      </div>`
    })}
  </main>`;

  return renderDocument({
    title: document.title,
    body,
    bodyClass: "case-study-body bd-document-body",
    styles: ["/pdf/theme.css"],
    scripts: slug ? ["/app/export-downloads-init.js"] : []
  });
}
