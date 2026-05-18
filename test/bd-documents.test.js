import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadBdDocumentsModule() {
  const documentDir = await fs.mkdtemp(path.join(os.tmpdir(), "bd-documents-"));
  process.env.BD_DOCUMENTS_DIR = documentDir;
  const module = await import(`../src/lib/bd-documents.js?dir=${encodeURIComponent(documentDir)}`);

  return {
    ...module,
    documentDir
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

test("normalizeBdDocument validates proof sections and offer pillars", async () => {
  const { normalizeBdDocument } = await loadBdDocumentsModule();
  const document = normalizeBdDocument(validDocument());

  assert.equal(document.title, "Enterprise product build support");
  assert.equal(document.offerPillars[0].deliverables[0], "Prototype");
  assert.equal(document.proofSections[0].visibility, "private");
});

test("normalizeBdDocument rejects non-local proof asset paths", async () => {
  const { normalizeBdDocument } = await loadBdDocumentsModule();

  assert.throws(
    () => normalizeBdDocument(validDocument({
      proofSections: [{ ...validDocument().proofSections[0], assetPath: "https://example.com/proof.png" }]
    })),
    /local \/assets\//
  );
});

test("normalizeBdDocument enforces PDF-aware copy limits", async () => {
  const { normalizeBdDocument } = await loadBdDocumentsModule();

  assert.throws(
    () => normalizeBdDocument(validDocument({
      executivePromise: "A".repeat(261)
    })),
    /executivePromise must be 260 characters or fewer/
  );

  assert.throws(
    () => normalizeBdDocument(validDocument({
      proofSections: [{ ...validDocument().proofSections[0], evidence: "A".repeat(141) }]
    })),
    /Proof evidence must be 140 characters or fewer/
  );
});

test("saveBdDocumentRecord rejects stale revisions", async () => {
  const { saveBdDocumentRecord } = await loadBdDocumentsModule();
  const first = await saveBdDocumentRecord("enterprise-build-support", validDocument(), "new");
  const second = await saveBdDocumentRecord(
    "enterprise-build-support",
    validDocument({ subtitle: "Second save." }),
    first.revision
  );

  await assert.rejects(
    () => saveBdDocumentRecord("enterprise-build-support", validDocument({ subtitle: "Stale save." }), first.revision),
    error => error.status === 409 && /changed on disk/.test(error.message)
  );

  assert.notEqual(first.revision, second.revision);
});
