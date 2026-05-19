import assert from "node:assert/strict";
import test from "node:test";

import { toHtml } from "../src/lib/html.js";
import { renderDashboard } from "../src/templates/app.js";

const PROJECTS = [
  {
    slug: "sample-case-study",
    title: "Sample case study",
    subtitle: "A focused proof story.",
    year: "2026",
    sector: "Product"
  }
];

const BD_DOCUMENTS = [
  {
    slug: "sample-bd-document",
    title: "Sample BD document",
    subtitle: "A focused sales document.",
    year: "2026",
    audience: "Enterprise buyers"
  }
];

test("dashboard defaults to case-study view with local creation action", () => {
  const markup = toHtml(renderDashboard(PROJECTS, BD_DOCUMENTS));

  assert.match(markup, /<title>Case studies<\/title>/);
  assert.match(markup, /href="\/\?view=case-studies" aria-current="page"/);
  assert.match(markup, /href="\/\?view=bd-documents" aria-current="false"/);
  assert.match(markup, /href="\/builder\/new-case-study"/);
  assert.match(markup, />New case study</);
  assert.doesNotMatch(markup, /New project/);
  assert.doesNotMatch(markup, /href="\/bd-builder\/new-business-development-doc"/);
});

test("dashboard BD view uses its own creation action", () => {
  const markup = toHtml(renderDashboard(PROJECTS, BD_DOCUMENTS, { activeView: "bd-documents" }));

  assert.match(markup, /<title>Business development documents<\/title>/);
  assert.match(markup, /href="\/\?view=case-studies" aria-current="false"/);
  assert.match(markup, /href="\/\?view=bd-documents" aria-current="page"/);
  assert.match(markup, /href="\/bd-builder\/new-business-development-doc"/);
  assert.match(markup, />New BD document</);
  assert.doesNotMatch(markup, /New project/);
  assert.doesNotMatch(markup, /href="\/builder\/new-case-study"/);
});
