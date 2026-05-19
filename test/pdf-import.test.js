import assert from "node:assert/strict";
import test from "node:test";

import { assertPdfUpload, bdDocumentDraftFromPdfText, projectDraftFromPdfText } from "../src/lib/pdf-import.js";

test("projectDraftFromPdfText maps exported case-study sections into editable fields", () => {
  const draft = projectDraftFromPdfText(`
Case study2026
TransportationEnterprise productLead designer
Ride request portfolio case study
A concise subtitle for the imported case study.

Snapshot02
Project snapshot
Year
2026
Sector
Transportation
Client type
Enterprise product
Role
Lead designer
Collaborators
Design, Engineering
The context paragraph lands here for the builder.

Challenge03
Communication challenge
The challenge paragraph is extracted.
Audience
Design leaders and product partners.

Approach04
Approach
The approach paragraph is extracted.

Decisions05
Key visual decisions
01
First decision
Decision body.

Outputs06
Outputs
01
First output
Output body.

Impact07
Impact
01
Faster updates
Impact body.

Reflection08
Reflection
The reflection paragraph is extracted.
Confidentiality notes
Keep sensitive assets hidden.
  `, { pdfTitle: "Ride request portfolio case study" });

  assert.equal(draft.title, "Ride request portfolio case study");
  assert.equal(draft.year, "2026");
  assert.equal(draft.sector, "Transportation");
  assert.deepEqual(draft.collaborators, ["Design", "Engineering"]);
  assert.equal(draft.context, "The context paragraph lands here for the builder.");
  assert.equal(draft.keyDecisions[0].title, "First decision");
  assert.equal(draft.outputs[0].description, "Output body.");
  assert.equal(draft.impact[0].metric, "Faster updates");
  assert.equal(draft.confidentialityNotes, "Keep sensitive assets hidden.");
});

test("bdDocumentDraftFromPdfText maps business development PDF sections", () => {
  const draft = bdDocumentDraftFromPdfText(`
Business development2026
Enterprise leadersFull build supportEnterprise sales
Enterprise product build support
Support for ambiguous product opportunities.

Promise02
Executive promise
Clarify the opportunity and move it toward production.
We connect strategy, design and implementation support.
Audience
Enterprise leaders

Buyer problems03
Where we help
01
High-stakes
ambiguity
Teams need clearer product shape.

Offer04
Strategy through build
01
Product strategy
Frame the opportunity and define proof.

Process05
Delivery process
Reduce uncertainty in sequence.
01
Diagnose
Clarify constraints.

Proof 106
Reduced delivery uncertainty
Enterprise service teamprivate
Problem
Stakeholders disagreed on release scope.
Intervention
Created a prototype path and decision narrative.
Outcome
The team agreed a clearer first release boundary.
Evidence
Anonymized workflow map and decision notes.

Engagement09
Engagement models
01
Opportunity sprint
Best for
A high-value idea.
Scope
Discovery and framing.
Timeline
2-3 weeks

Next steps10
Outcomes and CTA
Book a working session.
Confidentiality
Anonymize proof by default.
  `, { pdfTitle: "Enterprise product build support" });

  assert.equal(draft.title, "Enterprise product build support");
  assert.equal(draft.year, "2026");
  assert.equal(draft.audience, "Enterprise leaders");
  assert.equal(draft.buyerProblems[0].title, "High-stakes ambiguity");
  assert.equal(draft.offerPillars[0].title, "Product strategy");
  assert.equal(draft.processSummary, "Reduce uncertainty in sequence.");
  assert.equal(draft.process[0].description, "Clarify constraints.");
  assert.equal(draft.proofSections[0].headline, "Reduced delivery uncertainty");
  assert.equal(draft.proofSections[0].clientContext, "Enterprise service team");
  assert.equal(draft.proofSections[0].visibility, "private");
  assert.equal(draft.proofSections[0].problem, "Stakeholders disagreed on release scope.");
  assert.equal(draft.engagementModels[0].timeline, "2-3 weeks");
  assert.equal(draft.confidentialityNotes, "Anonymize proof by default.");
});

test("assertPdfUpload rejects non-PDF content", () => {
  assert.throws(
    () => assertPdfUpload(Buffer.from("not a pdf"), "application/pdf"),
    /valid PDF/
  );

  assert.throws(
    () => assertPdfUpload(Buffer.from("%PDF-1.4"), "text/plain"),
    /Unsupported file type/
  );
});
