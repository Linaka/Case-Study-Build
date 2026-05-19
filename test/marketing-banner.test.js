import assert from "node:assert/strict";
import test from "node:test";

import { toHtml } from "../src/lib/html.js";
import { renderBdDocument } from "../src/templates/bd-document.js";
import { renderCaseStudy } from "../src/templates/case-study.js";
import { renderMarketingBanner } from "../src/templates/marketing-banner.js";

const PROJECT = {
  title: "Production case study",
  subtitle: "A focused proof story for enterprise product teams.",
  year: "2026",
  sector: "Product",
  clientType: "Enterprise",
  role: "Design engineering",
  context: "Context.",
  challenge: "Challenge.",
  audience: "Audience.",
  approach: "Approach.",
  keyDecisions: [],
  outputs: [],
  impact: [{ metric: "42% faster", value: 42, unit: "%", description: "Outcome." }],
  reflection: "Reflection.",
  confidentialityNotes: "No sensitive data.",
  assets: [
    {
      path: "/assets/projects/sample/hidden.png",
      caption: "Hidden visual.",
      visibility: "hidden",
      slot: "cover"
    },
    {
      path: "/assets/projects/sample/banner.png",
      caption: "Banner visual.",
      visibility: "public",
      slot: "cover"
    }
  ]
};

const BD_DOCUMENT = {
  title: "Enterprise product build support",
  subtitle: "Strategy through launch support for complex product work.",
  year: "2026",
  audience: "Enterprise product leads",
  positioning: "Positioning.",
  executivePromise: "Promise.",
  buyerProblems: [],
  offerPillars: [],
  processSummary: "Process.",
  process: [],
  proofSections: [],
  engagementModels: [],
  nextSteps: "Next steps.",
  primaryCta: "Book a product build workshop",
  secondaryCta: "Review proof sections",
  confidentialityNotes: "Confidential.",
  assets: [
    {
      path: "/assets/bd/sample/banner.png",
      caption: "BD visual.",
      visibility: "private",
      slot: "cover"
    }
  ]
};

test("case-study marketing banner renders a 16:9 image-ready document", () => {
  const markup = toHtml(renderMarketingBanner(PROJECT, { type: "project" }));

  assert.match(markup, /marketing-banner-body/);
  assert.match(markup, /Case study/);
  assert.match(markup, /Production case study/);
  assert.match(markup, /42% faster/);
  assert.match(markup, /\/assets\/projects\/sample\/banner\.png/);
  assert.doesNotMatch(markup, /hidden\.png/);
});

test("BD marketing banner renders sales positioning and CTA", () => {
  const markup = toHtml(renderMarketingBanner(BD_DOCUMENT, { type: "bd" }));

  assert.match(markup, /Business development/);
  assert.match(markup, /Enterprise product build support/);
  assert.match(markup, /Book a product build workshop/);
  assert.match(markup, /\/assets\/bd\/sample\/banner\.png/);
});

test("preview toolbars expose marketing banner exports", () => {
  const caseStudyMarkup = toHtml(renderCaseStudy(PROJECT, { slug: "production-case-study" }));
  const bdMarkup = toHtml(renderBdDocument(BD_DOCUMENT, { slug: "enterprise-build-support" }));

  assert.match(caseStudyMarkup, /href="\/api\/export\/banner\/production-case-study"/);
  assert.match(bdMarkup, /href="\/api\/export\/bd\/banner\/enterprise-build-support"/);
});
