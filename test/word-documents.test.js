import assert from "node:assert/strict";
import test from "node:test";

import {
  bdDocumentFromDocx,
  isDocxBuffer,
  projectFromDocx,
  renderBdDocumentDocx,
  renderProjectDocx
} from "../src/lib/word-documents.js";

function validProject(overrides = {}) {
  return {
    title: "Production case study",
    subtitle: "A structured case study.",
    year: "2026",
    sector: "Product",
    clientType: "Internal",
    role: "Design engineering",
    collaborators: ["Research"],
    context: "Context.",
    challenge: "Challenge.",
    audience: "Audience.",
    approach: "Approach.",
    keyDecisions: [{ title: "Decision", description: "Reasoning." }],
    outputs: [{ title: "Output", description: "Result." }],
    impact: [{ metric: "Adoption", value: 42, unit: "%", description: "Outcome." }],
    reflection: "Reflection.",
    confidentialityNotes: "No sensitive data.",
    assets: [
      {
        path: "/assets/uber/route-frame.svg",
        caption: "Cover image.",
        visibility: "public",
        slot: "cover"
      }
    ],
    ...overrides
  };
}

function validDocument(overrides = {}) {
  return {
    title: "Enterprise product build support",
    subtitle: "A sales document.",
    year: "2026",
    audience: "Enterprise leads",
    positioning: "Positioning.",
    executivePromise: "Promise.",
    buyerProblems: [{ title: "Ambiguity", description: "Unclear next product step." }],
    offerPillars: [{ title: "Build support", description: "Carry intent into delivery.", deliverables: ["Prototype"] }],
    processSummary: "Process summary.",
    process: [{ title: "Shape", description: "Define the product bet." }],
    proofSections: [
      {
        headline: "Anonymized proof",
        clientContext: "Enterprise team",
        problem: "Problem.",
        intervention: "Intervention.",
        outcome: "Outcome.",
        evidence: "Evidence.",
        projectSlug: "sample-project",
        assetPath: "/assets/uber/decision-grid.svg",
        visibility: "private"
      }
    ],
    engagementModels: [{ title: "Sprint", bestFor: "Clarity.", scope: "Discovery.", timeline: "2 weeks" }],
    nextSteps: "Next steps.",
    primaryCta: "Book a review",
    secondaryCta: "Share a brief",
    confidentialityNotes: "Anonymized by default.",
    assets: [{ path: "/assets/uber/output-suite.svg", caption: "Cover.", visibility: "public", slot: "cover" }],
    ...overrides
  };
}

test("case studies export to importable Word documents", () => {
  const exported = renderProjectDocx(validProject());
  const imported = projectFromDocx(exported);
  const packageText = exported.toString("utf8");

  assert.equal(isDocxBuffer(exported), true);
  assert.match(packageText, /Title character limit: \d+\/82 \(OK\)/);
  assert.match(packageText, /Context character limit: \d+\/650 \(OK\)/);
  assert.equal(imported.title, "Production case study");
  assert.equal(imported.keyDecisions[0].title, "Decision");
  assert.equal(imported.impact[0].value, 42);
  assert.equal(imported.impact[0].unit, "%");
  assert.equal(imported.assets[0].slot, "cover");
});

test("business development docs export to importable Word documents", () => {
  const exported = renderBdDocumentDocx(validDocument());
  const imported = bdDocumentFromDocx(exported);
  const packageText = exported.toString("utf8");

  assert.equal(isDocxBuffer(exported), true);
  assert.match(packageText, /Executive promise character limit: \d+\/260 \(OK\)/);
  assert.match(packageText, /Proof 1 headline character limit: \d+\/78 \(OK\)/);
  assert.equal(imported.title, "Enterprise product build support");
  assert.equal(imported.offerPillars[0].deliverables[0], "Prototype");
  assert.equal(imported.proofSections[0].projectSlug, "sample-project");
  assert.equal(imported.engagementModels[0].timeline, "2 weeks");
  assert.equal(imported.assets[0].path, "/assets/uber/output-suite.svg");
});

test("Word character limits use coloured over-limit conditions", () => {
  const exported = renderProjectDocx(validProject({
    title: "A".repeat(83)
  }));
  const packageText = exported.toString("utf8");

  assert.match(packageText, /Title character limit: 83\/82 \(Too long by 1\)/);
  assert.match(packageText, /w:pStyle w:val="LimitOver"/);
  assert.match(packageText, /w:style w:type="paragraph" w:styleId="LimitOver"/);
});
