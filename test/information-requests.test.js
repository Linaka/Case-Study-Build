import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "case-study-information-requests-"));
const previousEnv = {
  INFORMATION_REQUESTS_DIR: process.env.INFORMATION_REQUESTS_DIR,
  PROJECTS_DIR: process.env.PROJECTS_DIR,
  BD_DOCUMENTS_DIR: process.env.BD_DOCUMENTS_DIR,
  ENGINEERING_REPORTS_DIR: process.env.ENGINEERING_REPORTS_DIR,
  ENGINEERING_REPORT_SUBSECTIONS_DIR: process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR
};

process.env.INFORMATION_REQUESTS_DIR = path.join(root, "requests");
process.env.PROJECTS_DIR = path.join(root, "projects");
process.env.BD_DOCUMENTS_DIR = path.join(root, "bd");
process.env.ENGINEERING_REPORTS_DIR = path.join(root, "engineering-reports");
process.env.ENGINEERING_REPORT_SUBSECTIONS_DIR = path.join(root, "engineering-subsections");

await fs.mkdir(process.env.PROJECTS_DIR, { recursive: true });
await fs.mkdir(process.env.BD_DOCUMENTS_DIR, { recursive: true });
await fs.mkdir(process.env.ENGINEERING_REPORTS_DIR, { recursive: true });

const {
  createInformationRequest,
  receiveInformationRequestResponse,
  recordInformationRequestDelivery,
  resolveInformationRequestTarget
} = await import("../src/lib/information-requests.js");
const { readProject } = await import("../src/lib/projects.js");
const { readBdDocument } = await import("../src/lib/bd-documents.js");
const { microsoftStatus } = await import("../src/lib/microsoft-graph.js");

test.after(async () => {
  Object.entries(previousEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  await fs.rm(root, { recursive: true, force: true });
});

function projectFixture(overrides = {}) {
  return {
    title: "Sample project",
    subtitle: "",
    year: "2026",
    sector: "",
    clientType: "",
    role: "",
    collaborators: [],
    context: "Old context.",
    challenge: "",
    audience: "",
    approach: "",
    keyDecisions: [],
    outputs: [],
    impact: [],
    reflection: "",
    confidentialityNotes: "",
    assets: [],
    ...overrides
  };
}

function bdFixture(overrides = {}) {
  return {
    title: "Enterprise build support",
    subtitle: "",
    year: "2026",
    audience: "Leads",
    positioning: "",
    executivePromise: "",
    buyerProblems: [],
    offerPillars: [],
    processSummary: "",
    process: [],
    proofSections: [],
    engagementModels: [],
    nextSteps: "",
    primaryCta: "",
    secondaryCta: "",
    confidentialityNotes: "",
    assets: [],
    ...overrides
  };
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("information requests auto-apply project field responses", async () => {
  await writeJson(path.join(process.env.PROJECTS_DIR, "sample-project.json"), projectFixture());

  const resolved = await resolveInformationRequestTarget({
    subjectType: "project",
    subjectSlug: "sample-project",
    targetKind: "field",
    targetPath: "context"
  });
  const request = await createInformationRequest({
    ...resolved,
    channel: "email",
    recipients: [{ email: "sam@example.com", name: "Sam" }],
    message: "Please update context.",
    createdBy: "editor"
  });

  assert.equal(resolved.currentBody, "Old context.");
  assert.equal(request.responseStatus.state, "pending");

  const sent = await recordInformationRequestDelivery(request.token, {
    state: "sent",
    sentAt: "2026-05-29T10:00:00.000Z",
    error: "",
    provider: { graphMessageId: "message-1" }
  });

  assert.equal(sent.deliveryStatus.state, "sent");
  assert.equal(sent.provider.graphMessageId, "message-1");

  const received = await receiveInformationRequestResponse(request.token, {
    contributorName: "Sam",
    body: "Updated context."
  });
  const project = await readProject("sample-project");

  assert.equal(received.responseStatus.state, "applied");
  assert.equal(project.context, "Updated context.");
});

test("information requests support Teams channel records and BD list item auto-apply", async () => {
  await writeJson(path.join(process.env.BD_DOCUMENTS_DIR, "enterprise-build-support.json"), bdFixture({
    proofSections: [{
      headline: "Proof",
      clientContext: "",
      problem: "",
      intervention: "",
      outcome: "",
      evidence: "Old evidence.",
      projectSlug: "",
      assetPath: "",
      visibility: "private"
    }]
  }));

  const resolved = await resolveInformationRequestTarget({
    subjectType: "bd-document",
    subjectSlug: "enterprise-build-support",
    targetKind: "list-item",
    targetPath: "proofSections.0.evidence"
  });
  const request = await createInformationRequest({
    ...resolved,
    channel: "teams-channel",
    recipients: [],
    message: "Please add evidence.",
    provider: {
      teamId: "team-1",
      teamName: "Commercial",
      channelId: "channel-1",
      channelName: "Proof"
    },
    createdBy: "editor"
  });

  assert.equal(request.provider.teamName, "Commercial");
  assert.equal(request.target.label, "proofSections item 1 evidence");

  await receiveInformationRequestResponse(request.token, {
    contributorName: "Priya",
    body: "New evidence."
  });

  const document = await readBdDocument("enterprise-build-support");

  assert.equal(document.proofSections[0].evidence, "New evidence.");
});

test("information requests mark received responses apply-failed when the target disappeared", async () => {
  const projectPath = path.join(process.env.PROJECTS_DIR, "missing-target-project.json");
  const project = projectFixture({
    title: "Missing target project",
    context: "",
    keyDecisions: [{ title: "Decision", description: "Old." }]
  });

  await writeJson(projectPath, project);

  const resolved = await resolveInformationRequestTarget({
    subjectType: "project",
    subjectSlug: "missing-target-project",
    targetKind: "list-item",
    targetPath: "keyDecisions.0.description"
  });
  const request = await createInformationRequest({
    ...resolved,
    channel: "email",
    recipients: [{ email: "sam@example.com" }],
    message: "",
    createdBy: "editor"
  });

  await writeJson(projectPath, {
    ...project,
    keyDecisions: []
  });

  const received = await receiveInformationRequestResponse(request.token, {
    contributorName: "Sam",
    body: "New decision text."
  });

  assert.equal(received.responseStatus.state, "apply-failed");
  assert.match(received.responseStatus.applyError, /not supported/);
  assert.equal(received.response.body, "New decision text.");
});

test("microsoft status reports missing setup without throwing", async () => {
  const previous = {
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
    MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,
    MICROSOFT_TOKEN_SECRET: process.env.MICROSOFT_TOKEN_SECRET
  };

  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
  delete process.env.MICROSOFT_TENANT_ID;
  delete process.env.MICROSOFT_TOKEN_SECRET;

  try {
    const status = await microsoftStatus("editor");

    assert.equal(status.configured, false);
    assert.equal(status.connected, false);
    assert.deepEqual(status.missing, [
      "MICROSOFT_CLIENT_ID",
      "MICROSOFT_CLIENT_SECRET",
      "MICROSOFT_TENANT_ID",
      "MICROSOFT_TOKEN_SECRET"
    ]);
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

