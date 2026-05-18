import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadProjectsModule() {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "case-study-projects-"));
  process.env.PROJECTS_DIR = projectDir;
  const module = await import(`../src/lib/projects.js?dir=${encodeURIComponent(projectDir)}`);

  return {
    ...module,
    projectDir
  };
}

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
    impact: [{ metric: "Impact", description: "Outcome." }],
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

test("normalizeProject validates and preserves slotted assets", async () => {
  const { normalizeProject } = await loadProjectsModule();
  const project = normalizeProject(validProject());

  assert.equal(project.title, "Production case study");
  assert.equal(project.assets[0].slot, "cover");
  assert.equal(project.keyDecisions[0].title, "Decision");
});

test("normalizeProject rejects non-local asset paths", async () => {
  const { normalizeProject } = await loadProjectsModule();

  assert.throws(
    () => normalizeProject(validProject({
      assets: [{ path: "https://example.com/image.png", caption: "", visibility: "public", slot: "cover" }]
    })),
    /local \/assets\//
  );
});

test("saveProjectRecord rejects stale revisions", async () => {
  const { saveProjectRecord } = await loadProjectsModule();
  const first = await saveProjectRecord("sample", validProject(), "new");
  const second = await saveProjectRecord("sample", validProject({ subtitle: "Second save." }), first.revision);

  await assert.rejects(
    () => saveProjectRecord("sample", validProject({ subtitle: "Stale save." }), first.revision),
    error => error.status === 409 && /changed on disk/.test(error.message)
  );

  assert.notEqual(first.revision, second.revision);
});
